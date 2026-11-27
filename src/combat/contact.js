// CONTACT (`?contact=0|a`; ADR-259): a blow lands ON what it strikes. The owner, 2026-11-27: "make every
// hit, deflect, guard, parry, deadly blow ... look like its actually hitting that part and clean. There are
// some moments it looks like the weapon is just going through the boss or player". Measured first (the
// contact audit): at the frame a blow was decided, the drawn steel or fist was as often 10 - 75 cm short of
// what it struck as 15 - 40 cm through it, the freeze held that frame, and the sparks sat on the hero's
// chest or the middle of his blade, not where the two met. A parry already met cleanly (parryContact).
//
// With it on (`a`), the striker is POSED where it meets the struck surface for the frame the hit-pause
// holds (it BITES: the edge a few cm in, a fist on the surface), a heavy blow holds there a beat longer,
// and then the swing carries on through (it catches up with its own clock: the FOLLOW-THROUGH). Nothing of
// the rules moves: the hit test, the damage, the windows and every clock run as before; only the pose
// shown is moved along its own clip (as parryContact does for a parry), and the contact's effects are
// drawn at the meeting point.
//   the boss's blow on the hero     duelist.strikeContact(meet, heavy): his pose stepped back or on along
//                                   the strike to the meeting (brain.pinAt), on the hero's body (a hit) or
//                                   on his blade (a block; through it only as far as the body)
//   the hero's cut on a boss        player._cutContact: his swing's shown clock (atk.show) moved to where
//                                   his drawn steel meets the boss's drawn body (a cut) or blade (a guard)
//   reactions                       the struck part answers (duelist/react.js; the hero's own: player/
//                                   heroReact.js), from the meeting point
// The headless sims keep `0` unless a scenario sets it (their checks were written for today's frames).

import { closestOnSegments } from './clashFx.js';

const IDS = ['0', 'a', 'b'];
let mode = '0';

export const CONTACT_IDS = IDS;
export const DEFAULT_CONTACT = '0';
/** '0' (as before), 'a' (blows land on what they strike) or 'b' (a, and a boss's blow that would fall short
 *  is reached into: his drawn body eases toward the hero as it comes). */
export const contactMode = () => mode;
export const contactOn = () => mode === 'a' || mode === 'b';
export const contactReach = () => mode === 'b';
export function setContactMode(m) {
  if (!IDS.includes(m)) return false;
  mode = m;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('contact') : null;
  if (typeof location !== 'undefined') mode = q && IDS.includes(q) ? q : DEFAULT_CONTACT;
}

// the numbers (metres of the drawn figure, seconds of the striker's own clip)
//   edge / fist / foot   the striker's radius: a blade's edge, a fist, a foot
//   bite                 how far the edge goes in at the contact (a fist: fistBite, on the surface)
//   dt, back, fwd        the search along the strike: steps of dt, at most `back` s behind the frame the
//                        blow was decided and `fwd` s past it
//   near                 a striker that never reaches is posed at its nearest only within `near` m
//                        (further: the reach band's blow, drawn as before)
//   hold / holdHeavy     s of game time it stays on the surface after the freeze (a heavy blow longer)
//   follow               s it takes to catch up with its clip after that (the follow-through)
export const CONTACT = Object.freeze({
  edge: 0.015,
  fist: 0.06,
  foot: 0.07,
  bite: 0.035,
  fistBite: 0.012,
  thin: 0.4, // a part is bitten at most this share of its radius (an arm 2.5 cm, a shin 2.4, the torso 3.5)
  dt: 1 / 120,
  back: 0.16,
  fwd: 0.075,
  near: 0.16,
  farFx: 0.8, // a blow that stays further off than `near` is not posed; within this its hurt is drawn on the body where it points
  hold: 0.0,
  holdHeavy: 0.06,
  follow: 0.07,
  // a blow on the hero's guard stops on his blade, or `shell` m before his body where it would get past
  // it (the guard is nudged onto it: `nudge` m at most, eased off over `nudgeBack` s)
  guard: { shell: 0.12, bite: 0.01, nudge: 0.3, nudgeBack: 0.3 },
  // the reach (`b`): as a blow comes (`lead` s before its impact) with the hero in its zone, the gap its
  // striker would leave at the impact is closed by easing his drawn body toward the hero, `max` m at most
  // (his feet stay planted: the legs are solved again), gaps under `min` left alone; held `after` s past the
  // impact (and while the blow is pinned), eased back over `back` s
  reach: { lead: 0.14, max: 0.3, min: 0.03, after: 0.1, back: 0.22 },
  // the reactions: the hero's own (HitReact on him) at this x impactK('react')
  react: { hero: 1.2 },
  // the hero's cut: the same search on his swing's clock (his blade is thrown faster: finer steps)
  //   guardHold / guardFollow: a cut met on his ward (not thrown back) stays on his steel longer
  hero: { dt: 1 / 120, back: 0.07, fwd: 0.06, near: 0.2, hold: 0.0, holdHeavy: 0.07, follow: 0.06, guardHold: 0.08, guardFollow: 0.12 },
  // a capsule body of a figure built on the hero's rig (model.js: every duelist): radii (m, × its drawn
  // scale) and where each one runs on its joints (local offsets)
  body: { torso: 0.15, head: 0.105, upper: 0.062, fore: 0.052, thigh: 0.08, shin: 0.06 },
});

const PARTS = ['body', 'head', 'armR', 'armR', 'armL', 'armL', 'legR', 'legR', 'legL', 'legL'];

/**
 * The drawn body of a figure on the hero's rig, as ten capsules (the torso, the head, each upper arm and
 * forearm, each thigh and shin) on its joints' world matrices, and the signed gap of a striker to it.
 * One per figure; nothing allocated after the constructor.
 */
export class ContactBody {
  constructor(THREE, max = PARTS.length) {
    this.n = 0;
    this.max = Math.max(PARTS.length, max | 0);
    this.a = Array.from({ length: this.max }, () => new THREE.Vector3());
    this.b = Array.from({ length: this.max }, () => new THREE.Vector3());
    this.r = new Float32Array(this.max);
    this.spheres = false; // (fromSpheres: a wyrm's; `struck` reads their own part)
    this._parts = [];
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
    this._s = new THREE.Vector3();
    /** the last gap's struck capsule (index) and part name */
    this.hit = -1;
  }

  /** From the rig's joints as drawn now (their matrixWorld). S: the figure's drawn scale. (dx, dy, dz): a
   *  shift (the shove a hit gave the body this frame, before it was drawn). False without a rig. */
  fromRig(rig, S = 1, dx = 0, dy = 0, dz = 0) {
    if (!rig?.pelvis || !rig.chest || !rig.head || !rig.arms?.R || !rig.legs?.R) return false;
    const B = CONTACT.body;
    let i = 0;
    const put = (j0, y0, z0, j1, y1, z1, r) => {
      this.a[i].set(0, y0, z0).applyMatrix4(j0.matrixWorld);
      this.b[i].set(0, y1, z1).applyMatrix4(j1.matrixWorld);
      this.a[i].x += dx;
      this.a[i].y += dy;
      this.a[i].z += dz;
      this.b[i].x += dx;
      this.b[i].y += dy;
      this.b[i].z += dz;
      this.r[i] = r * S;
      i++;
    };
    put(rig.pelvis, -0.02, 0, rig.chest, 0.2, 0, B.torso);
    put(rig.head, 0.1, 0.02, rig.head, 0.16, 0.02, B.head);
    for (const s of ['R', 'L']) {
      const A = rig.arms[s];
      put(A.upper, 0, 0, A.fore, 0, 0, B.upper);
      put(A.fore, 0, 0, A.fore, -0.27, 0, B.fore);
    }
    for (const s of ['R', 'L']) {
      const G = rig.legs[s];
      put(G.thigh, 0, 0, G.shin, 0, 0, B.thigh);
      put(G.shin, 0, 0, G.foot, 0, 0, B.shin);
    }
    this.n = i;
    this.spheres = false;
    for (let k = 0; k < i; k++) if (!Number.isFinite(this.a[k].x + this.a[k].y + this.a[k].z + this.b[k].x + this.b[k].y + this.b[k].z)) return (this.n = 0), false;
    return true;
  }

  /** From spheres {x, y, z, r} (the wyrm's hurt spheres: drawn where they are). */
  fromSpheres(list) {
    let i = 0;
    if (!Array.isArray(list)) return false;
    for (let k = 0; k < list.length && i < this.max; k++) {
      const q = list[k];
      if (!q || !(q.r > 0) || !Number.isFinite(q.x + q.y + q.z)) continue;
      this.a[i].set(q.x, q.y, q.z);
      this.b[i].set(q.x, q.y, q.z);
      this.r[i] = q.r;
      this._parts[i] = typeof q.part === 'string' ? q.part : 'body';
      i++;
    }
    this.n = i;
    this.spheres = true;
    return i > 0;
  }

  /** The signed gap (m: + short of the body, − inside it) of the striker a→b of radius r; the point on
   *  the body's surface nearest it into `out` (optional); this.hit = the capsule. Infinity without a body.
   *  `bite` (optional): the depth the caller's search stops at (a thin part's gap is read deeper: CONTACT.thin). */
  gap(a, b, r, out = null, bite = 0) {
    let best = Infinity, bi = -1;
    const P = this._p, Q = this._q;
    for (let i = 0; i < this.n; i++) {
      // (`bite`: the depth the caller searches for; a thin part (an arm, a shin) is bitten at most
      // CONTACT.thin of its radius: the gap is read that much deeper so the search stops sooner)
      const g = closestOnSegments(a, b, this.a[i], this.b[i], P, Q) - this.r[i] - r - (bite > 0 ? Math.max(0, bite - CONTACT.thin * this.r[i]) : 0);
      if (g < best) {
        best = g;
        bi = i;
        this._s.copy(Q).sub(P); // (body axis → striker, reversed below)
        if (out) {
          const l = this._s.length();
          // the surface point: from the capsule's axis toward the striker, at its radius
          if (l > 1e-6) out.copy(Q).addScaledVector(this._s, -this.r[i] / l);
          else out.copy(Q);
        }
      }
    }
    this.hit = bi;
    return best;
  }

  /** The struck capsule's part name ('body' | 'head' | 'armR' | 'armL' | 'legR' | 'legL'), or null. */
  get struck() {
    return this.hit >= 0 ? (this.spheres ? this._parts[this.hit] : PARTS[this.hit]) : null;
  }
}

/**
 * Search a striker's own clock for the meeting: `at(t)` poses it at clock time t and returns the signed gap
 * (− inside) of its striker to what it strikes. From t1 (the frame the blow was decided): inside past the
 * bite → back to where it crossed; short → on to where it reaches (stopping where it turns away). Returns
 * the clock time of the meeting (interpolated between steps) or NaN when it never comes within `near`.
 * The striker is left posed at the last time tried: the caller poses it at the answer.
 */
export function findContact(at, t1, bite, K = CONTACT, tMin = 0) {
  const g1 = at(t1);
  if (!Number.isFinite(g1)) return NaN;
  const steps = Math.ceil(K.back / K.dt), fwd = Math.ceil(K.fwd / K.dt);
  // (a bracket found: `o` outside the bite, `i` past it; three halvings put the pose at the bite, never deeper)
  const refine = (o, i) => {
    for (let n = 0; n < 3; n++) {
      const m = (o + i) / 2, g = at(m);
      if (!Number.isFinite(g)) break;
      if (g >= -bite) o = m;
      else i = m;
    }
    return o;
  };
  if (g1 < -bite) {
    // inside: back along the strike to the last pose still at the bite
    let tp = t1, tb = t1, gb = g1;
    for (let k = 1; k <= steps; k++) {
      const t = t1 - k * K.dt;
      if (t < tMin) break;
      const g = at(t);
      if (!Number.isFinite(g)) break;
      if (g >= -bite) return refine(t, tp);
      if (g > gb) {
        gb = g;
        tb = t;
      }
      tp = t;
    }
    return tb; // (never clear in the window: the least deep pose)
  }
  if (g1 <= 0.02) return t1; // already on it
  // short: on along the strike to where it reaches the bite
  let tp = t1, tb = t1, gb = g1;
  for (let k = 1; k <= fwd; k++) {
    const t = t1 + k * K.dt;
    const g = at(t);
    if (!Number.isFinite(g)) break;
    if (g <= -bite) return refine(tp, t);
    if (g < gb) {
      gb = g;
      tb = t;
    } else if (g > gb + 0.03) break; // turning away: the nearest was behind
    tp = t;
  }
  return gb <= K.near ? tb : NaN;
}

/** A pin on a striker's shown clock (the follow-through): `show` = how far the pose shown runs behind its
 *  clock (− ahead). pin(tc, clock, hold, follow) holds the pose at clock time tc; step(clock, dt) moves it on.
 *  Its fields are plain numbers (a duelist's brain.back carries the same three). */
export function pinStep(P, clock, dt) {
  if (!P.pin) return 0;
  P.age += dt;
  const lag = clock - P.tc;
  if (P.rel < 0) {
    P.show = lag; // held at the contact
    if (P.age >= P.hold && lag >= 0) {
      P.rel = 0;
      P.show0 = lag;
    }
  }
  if (P.rel >= 0) {
    P.rel += dt / Math.max(1e-3, P.follow);
    const u = Math.min(1, P.rel);
    P.show = P.show0 * (1 - u * u * (3 - 2 * u));
    if (u >= 1) {
      P.pin = false;
      P.show = 0;
    }
  }
  return P.show;
}
export const newPin = () => ({ pin: false, tc: 0, age: 0, hold: 0, follow: 0.07, rel: -1, show: 0, show0: 0 });
export function pinAt(P, tc, clock, hold, follow) {
  P.pin = true;
  P.tc = tc;
  P.age = 0;
  P.hold = Math.max(0, hold);
  P.follow = Math.max(0.01, follow);
  P.rel = -1;
  P.show = clock - tc;
  P.show0 = 0;
}
