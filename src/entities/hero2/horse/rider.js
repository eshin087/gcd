// The rider: the remade hero (../engine.js createHero2, the real body ../body.js) seated on the horse.
//
// Each game step, AFTER the horse's update: his root is placed so his DRAWN hips (he is drawn 1.08x)
// sit on `horse.saddle()`, turned with the horse (its pitch and roll followed part way: a rider keeps
// his own balance). On top of whatever clip he plays, a small correction runs before his body draws:
//   - the SEAT layer (additive, always on): per gait, how the hips ride the saddle and the trunk leans
//     (measured from the reference footage, see SEAT_GAITS);
//   - the legs: two-bone IK of each ankle to its stirrup;
//   - the hands: to the reins (a CCD pass on the arm), only when the ride entry says the clip holds them
//     and the clip's props leave that hand free.
// Paired playback: RIDES pairs a horse clip with a rider clip and a time offset, so `ride.play(name)`
// plays both in step. The rider's clips are another author's (the sets moveHorse / swordHorse); until a
// clip exists he sits in one generated seated pose, 'rideSeat' (added to his library at start).
//
//   createRide(game, { horse, hero, body, drawScale = 1.08 }) -> ride:
//     play(name, opts)   a RIDES entry by its name (a horse clip, or a rider clip such as 'rideWalk')
//     show(riderClip)    the review's hook: the entry whose rider clip it is
//     owns(clip)         true for a clip of the sets moveHorse / swordHorse (the review shows those on the horse)
//     update(dt)         the horse's update, then his placement (call BEFORE hero.update(dt))
//     prepareView(cam, opts)  per render: both bodies' lean toward that camera, matched at the saddle
//     entry, active, seat (the live seat state), stop()
import * as THREE from 'three';
import { JI, J, createPose } from '../skeleton.js';
import { HDIM } from '../dims.js';
import { legIK } from '../feet.js';
import { decodeClip, encodeQ, encodeF32 } from '../clip.js';
import { qmul, qconjmul, qfromTo, qnorm } from '../qmath.js';
import { solveFK } from '../skeleton.js';

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const deg = Math.PI / 180;

// ------------------------------------------------------------------ the pairs
// name: what ride.play() takes. horse / rider: the two clips. offset: s the rider's clip starts after
// the horse's (negative: before). reins: his hands go to the reins when the clip leaves them free.
// events: the horse's times the rider's author lines up with (riderOn: his weight lands in the saddle;
// riderOff: it leaves; takeoff / land / kick; hit: the cuts the horse reacts to).
export const RIDES = [
  { name: 'horseStand', horse: 'horseStand', rider: 'rideIdle', offset: 0, reins: true },
  { name: 'horseMount', horse: 'horseMount', rider: 'rideMount', offset: 0, reins: false, events: { riderOn: 0.7 } },
  { name: 'horseDismount', horse: 'horseDismount', rider: 'rideDismount', offset: 0, reins: false, events: { riderOff: 0.5 } },
  { name: 'rideMountRun', horse: 'horseRun', rider: 'rideMountRun', offset: 0, reins: false, events: { riderOn: 'the rider clip decides: the horse canters on (0.60 s cycle)' } },
  { name: 'rideDismountRun', horse: 'horseRunStop', rider: 'rideDismountRun', offset: 0, reins: false, events: { riderOff: 'the rider clip decides: the horse halts under him (1.5 s)' } },
  { name: 'horseWalkStart', horse: 'horseWalkStart', rider: 'rideWalk', offset: 0, reins: true },
  { name: 'horseWalk', horse: 'horseWalk', rider: 'rideWalk', offset: 0, reins: true },
  { name: 'horseWalkStop', horse: 'horseWalkStop', rider: 'rideWalk', offset: 0, reins: true },
  { name: 'horseRunStart', horse: 'horseRunStart', rider: 'rideRun', offset: 0, reins: true },
  { name: 'horseRun', horse: 'horseRun', rider: 'rideRun', offset: 0, reins: true },
  { name: 'horseRunStop', horse: 'horseRunStop', rider: 'rideRun', offset: 0, reins: true },
  { name: 'horseSprintStart', horse: 'horseSprintStart', rider: 'rideSprint', offset: 0, reins: true },
  { name: 'horseSprint', horse: 'horseSprint', rider: 'rideSprint', offset: 0, reins: true },
  { name: 'horseSprintStop', horse: 'horseSprintStop', rider: 'rideSprint', offset: 0, reins: true },
  { name: 'horseTurnL', horse: 'horseTurnL', rider: 'rideIdle', offset: 0, reins: true },
  { name: 'horseTurnR', horse: 'horseTurnR', rider: 'rideIdle', offset: 0, reins: true },
  { name: 'horseWalkTurnL', horse: 'horseWalkTurnL', rider: 'rideWalk', offset: 0, reins: true },
  { name: 'horseWalkTurnR', horse: 'horseWalkTurnR', rider: 'rideWalk', offset: 0, reins: true },
  { name: 'horseJump', horse: 'horseJump', rider: 'rideJump', offset: 0, reins: true, events: { takeoff: 0.27, land: 0.77, hindLand: 0.87 } },
  { name: 'horseDoubleJump', horse: 'horseDoubleJump', rider: 'rideDoubleJump', offset: 0, reins: true, events: { takeoff: 0.27, kick: 0.82, land: 1.57, hindLand: 1.67 } },
  { name: 'horseJumpRun', horse: 'horseJumpRun', rider: 'rideJump', offset: -0.0, reins: true, events: { takeoff: 0.3, land: 0.8, hindLand: 0.9 } },
  { name: 'horseRiderLight', horse: 'horseRiderLight', rider: 'rideLight', offset: 0, reins: false, events: { hit: [0.5] } },
  { name: 'horseRiderHeavy', horse: 'horseRiderHeavy', rider: 'rideHeavy', offset: 0, reins: false, events: { hit: [1.0, 3.4] } },
];
const BY_NAME = new Map(RIDES.map((r) => [r.name, r]));
const BY_RIDER = new Map();
for (const r of RIDES) if (!BY_RIDER.has(r.rider)) BY_RIDER.set(r.rider, r);
/** The rider's clip sets the review shows on the horse. */
export const RIDE_SETS = ['moveHorse', 'swordHorse'];

// ------------------------------------------------------------------ the seat (measured per gait)
// rise: his hips over the saddle point (m); lean: the trunk forward (rad); follow: how much of the
// horse's pitch his trunk takes (the rest he balances out); bounce: how much of the saddle's vertical
// speed his hips lag (sitting deep: a soft lag; standing in the stirrups: none).
// From the footage: the walk sits upright and sways; the canter sits DEEP and rocks with the horse; the
// gallop rides FORWARD AND UP, out of the saddle; the jumps lean forward.
export const SEAT_GAITS = {
  stand: { rise: 0, lean: 4 * deg, follow: 0.3, bounce: 0 },
  walk: { rise: 0, lean: 6 * deg, follow: 0.35, bounce: 0.005 },
  run: { rise: -0.01, lean: 10 * deg, follow: 0.5, bounce: 0.012 },
  sprint: { rise: 0.1, lean: 32 * deg, follow: 0.25, bounce: 0 },
  jump: { rise: 0.06, lean: 26 * deg, follow: 0.45, bounce: 0 },
};

// the seated pose (his own skeleton, local rotations): straddling, thighs forward and out, knees bent,
// a little forward in the trunk; the hands low in front (the reins pull them the rest of the way)
const SEAT = {
  thigh: { fwd: 62 * deg, out: 20 * deg },
  shin: 78 * deg, // knee flex
  foot: -14 * deg, // toes a little up (heels down)
  spine: 4 * deg,
  chest: 2 * deg,
  neck: -3 * deg,
  upperArm: { down: 70 * deg, fwd: 35 * deg },
  foreArm: 55 * deg,
};

const qxyz = (q, i, ax, ay, az) => {
  // qy(ay) * qx(ax) * qz(az) (YXZ)
  const e = new THREE.Euler(ax, ay, az, 'YXZ'), qq = new THREE.Quaternion().setFromEuler(e);
  q[i] = qq.x;
  q[i + 1] = qq.y;
  q[i + 2] = qq.z;
  q[i + 3] = qq.w;
};

/** The seated pose as a 2-frame loop in the hero's clip format ('rideSeat'). */
export function seatClip() {
  const p = createPose();
  const q = p.q;
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    // thigh: forward (a down bone turned about X by -fwd), out (about Z, toward his side)
    qxyz(q, JI['thigh' + s] * 4, -SEAT.thigh.fwd, 0, k * SEAT.thigh.out);
    qxyz(q, JI['shin' + s] * 4, SEAT.shin, 0, 0);
    qxyz(q, JI['foot' + s] * 4, SEAT.foot, 0, 0);
    // arms: from the T-pose, down by `down` and forward by `fwd`; the elbow bent
    qxyz(q, JI['upperArm' + s] * 4, 0, -k * SEAT.upperArm.fwd, -k * SEAT.upperArm.down);
    qxyz(q, JI['foreArm' + s] * 4, 0, -k * SEAT.foreArm, 0);
  }
  qxyz(q, JI.spine * 4, SEAT.spine, 0, 0);
  qxyz(q, JI.chest * 4, SEAT.chest, 0, 0);
  qxyz(q, JI.neck * 4, SEAT.neck, 0, 0);
  const n = 2, Q = new Float32Array(n * J * 4), H = new Float32Array(n * 3), R0 = new Float32Array(n * 3);
  for (let f = 0; f < n; f++) {
    Q.set(q, f * J * 4);
    H.set(p.hips, f * 3);
  }
  return {
    name: 'rideSeat', title: 'Riding: the seat (placeholder)', src: 'move 26:27-27:47 (the seat, generated)', fps: 30, n, loop: true, joints: null,
    q: encodeQ(Q), hips: encodeF32(H), root: encodeF32(R0), props: { R: null, L: null }, from: 'ride', to: 'ride',
  };
}

// ------------------------------------------------------------------ the ride
export function createRide(game, { horse, hero, body, drawScale = 1.08 } = {}) {
  const lib = hero?.player?.lib;
  // the seated pose joins his library (not its list: the review's order stays the footage's)
  if (lib?.byName && !lib.byName.has('rideSeat')) lib.byName.set('rideSeat', decodeClip(seatClip(), { set: 'rideSeat', title: 'Riding' }));
  const obj = hero?.object3d;
  if (hero?.feet) hero.feet.enabled = false; // no ground under his feet while he rides
  const S = {
    entry: null, active: false, t: 0,
    seat: { rise: 0, lean: 0, follow: 0.3, bounce: 0, lag: 0, vy: 0, lastY: null },
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), eul: new THREE.Euler(0, 0, 0, 'YXZ'),
    stL: new THREE.Vector3(), stR: new THREE.Vector3(), rein: new THREE.Vector3(),
    inv: new THREE.Matrix4(), m: new THREE.Matrix4(), v: new THREE.Vector3(),
    riderClip: null, pending: 0, rootY: 0,
  };
  const ride = {
    S,
    get entry() {
      return S.entry;
    },
    get active() {
      return S.active;
    },
    get seat() {
      return S.seat;
    },
    owns: (c) => !!c && RIDE_SETS.includes(c.set),
    /** Play RIDES entry `name` (both clips, in step). Returns false for an unknown name. */
    play(name, opts = {}) {
      const e = BY_NAME.get(name) ?? BY_RIDER.get(name);
      if (!e) return false;
      S.entry = e;
      S.active = true;
      S.t = 0;
      horse.play(e.horse, { fade: opts.fade ?? 0 });
      S.riderClip = lib?.has?.(e.rider) ? e.rider : 'rideSeat';
      S.pending = e.offset > 0 ? e.offset : 0;
      if (S.pending <= 0) hero.play(S.riderClip, { fade: opts.fade ?? 0, at: e.offset < 0 ? -e.offset : 0 });
      hero.applyRoot = false;
      S.seat.lastY = null;
      return true;
    },
    /** The review's hook: show the rider clip `name` on the horse. */
    show(name, opts) {
      return ride.play(name, opts);
    },
    stop() {
      S.active = false;
      S.entry = null;
      if (obj) obj.rotation.set(0, obj.rotation.y, 0);
    },
    /** The horse steps, then he is placed on it. Call BEFORE hero.update(dt). */
    update(dt) {
      dt = Math.max(0, fin(dt));
      horse.update(dt);
      if (!S.active || !obj) return;
      if (S.pending > 0) {
        S.pending -= dt;
        if (S.pending <= 0) hero.play(S.riderClip, { fade: 0 });
      }
      S.t += dt;
      // the seat follows the horse's gait (eased)
      const g = SEAT_GAITS[horse.clip?.gait] ?? SEAT_GAITS.stand, st = S.seat, k = dt > 0 ? 1 - Math.exp(-dt / 0.25) : 0;
      st.rise += (g.rise - st.rise) * k;
      st.lean += (g.lean - st.lean) * k;
      st.follow += (g.follow - st.follow) * k;
      st.bounce += (g.bounce - st.bounce) * k;
      horse.saddle(S.pos, S.quat);
      // his hips lag the saddle's rise and fall a little (sitting deep), eased back
      if (st.lastY != null && dt > 0) {
        const vy = (S.pos.y - st.lastY) / dt;
        st.lag += (-vy * st.bounce - st.lag) * (1 - Math.exp(-dt / 0.06));
      }
      st.lastY = S.pos.y;
      S.eul.setFromQuaternion(S.quat, 'YXZ');
      obj.rotation.order = 'YXZ';
      obj.rotation.set(S.eul.x * st.follow, S.eul.y, S.eul.z * 0.5);
      // his drawn hips onto the saddle point (+ the seat's rise and lag)
      S.v.set(0, HDIM.hipsY * drawScale, 0).applyEuler(obj.rotation);
      obj.position.set(S.pos.x - S.v.x, S.pos.y + st.rise + st.lag - S.v.y, S.pos.z - S.v.z);
      S.rootY = obj.position.y;
      horse.stirrup('L', S.stL);
      horse.stirrup('R', S.stR);
      horse.rein(S.rein);
    },
    /** Before a render: both bodies leaned toward that camera; his lean pivots on his raised root, the
     *  horse's on the ground, so his is shifted by the root's height to stay in the saddle. */
    prepareView(cam, opts) {
      horse.body?.prepareView?.(cam, opts);
      body?.prepareView?.(cam, opts);
      const L = body?.lean;
      if (L && S.active) {
        L.ox = L.k * L.dx * S.rootY;
        L.oz = L.k * L.dz * S.rootY;
        obj.updateMatrix();
        obj.updateMatrixWorld(true);
      } else if (L) L.ox = L.oz = 0;
    },
  };

  // ---- the correction, run inside his step (after his clip and FK, before his body draws)
  const pose = hero.pose, world = hero.world, rest = hero.rest;
  const _q = new Float64Array(8), _t = new Float64Array(3);
  function toLocal(v, out) {
    // a world point into his FK frame (his root at 0, unscaled)
    obj.updateMatrix();
    S.m.compose(obj.position, obj.quaternion, S.v.set(drawScale, drawScale, drawScale));
    S.inv.copy(S.m).invert();
    const x = v.x, y = v.y, z = v.z, e = S.inv.elements;
    out[0] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  /** CCD: turn upperArm and foreArm of `side` so the hand reaches t (FK frame). */
  function armTo(side, tx, ty, tz) {
    const ja = JI['upperArm' + side], jb = JI['foreArm' + side], jh = JI['hand' + side];
    for (let it = 0; it < 6; it++) {
      for (const j of [jb, ja]) {
        const P = world.p, R = world.r;
        const ax = P[jh * 3] - P[j * 3], ay = P[jh * 3 + 1] - P[j * 3 + 1], az = P[jh * 3 + 2] - P[j * 3 + 2];
        const bx = tx - P[j * 3], by = ty - P[j * 3 + 1], bz = tz - P[j * 3 + 2];
        const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
        if (la < 1e-5 || lb < 1e-5) continue;
        qfromTo(_q, 0, ax / la, ay / la, az / la, bx / lb, by / lb, bz / lb);
        // half a step (stable), the joint's new world rotation, then its local under its parent
        _q[0] *= 0.6;
        _q[1] *= 0.6;
        _q[2] *= 0.6;
        qnorm(_q, 0);
        qmul(_q, 4, _q, 0, R, j * 4);
        const par = j === ja ? JI['clav' + side] : ja;
        qconjmul(pose.q, j * 4, R, par * 4, _q, 4);
        qnorm(pose.q, j * 4);
        solveFK(pose, rest, world);
      }
    }
  }
  function adjust(world0) {
    if (!S.active || world0 !== world) return;
    try {
      // the seat layer: the trunk's lean (spine and chest share it)
      const st = S.seat, lean = st.lean;
      for (const [j, w] of [[JI.spine, 0.55], [JI.chest, 0.45]]) {
        _q[4] = Math.sin(lean * w * 0.5);
        _q[5] = 0;
        _q[6] = 0;
        _q[7] = Math.cos(lean * w * 0.5);
        qmul(pose.q, j * 4, _q, 4, pose.q, j * 4);
      }
      // (the head keeps looking ahead)
      _q[4] = Math.sin(-lean * 0.7 * 0.5);
      _q[7] = Math.cos(-lean * 0.7 * 0.5);
      qmul(pose.q, JI.neck * 4, _q, 4, pose.q, JI.neck * 4);
      solveFK(pose, rest, world);
      // the legs: the ankles to the stirrups (the tread is under the ball of the foot: the ankle above it)
      for (const [s, sv] of [['L', S.stL], ['R', S.stR]]) {
        toLocal(sv, _t);
        legIK(pose, world, s, _t[0], _t[1] + HDIM.ankle * 0.8, _t[2] - 0.05, false);
      }
      solveFK(pose, rest, world);
      // the hands to the reins when the entry holds them and the clip leaves the hand free
      const props = hero.clip?.props;
      if (S.entry?.reins) {
        toLocal(S.rein, _t);
        for (const [s, k] of [['L', 1], ['R', -1]]) if (!props?.[s]) armTo(s, _t[0] + k * 0.06, _t[1], _t[2]);
      }
    } catch (e) {
      if (!ride._warned) console.warn('[ride] seat:', e);
      ride._warned = true;
    }
  }
  if (body && typeof body.update === 'function' && !body._rideWrapped) {
    const real = body.update;
    body.update = function (w, dt) {
      adjust(w);
      return real.call(this, w, dt);
    };
    body._rideWrapped = true;
  }
  return ride;
}
