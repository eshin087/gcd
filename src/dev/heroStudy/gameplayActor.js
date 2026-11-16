// Instance-only adapter for hero-play.html. No Player prototype or shared rig data changes.
import { createTemperedPoses, STUDY } from './actor.js';
import { installTemperedHands } from './hands.js';
import { temperedAttack, originalAttack } from './attacks.js';

export function installGameplayStudy(player, initial = 'tempered') {
  let enabled = initial !== 'current', animator, source, tempered;
  const root = player.object3d;
  const updateMatrix = root.updateMatrix;
  const update = player.update, unlean = player.unlean, leanPoint = player.leanPoint;
  const startAttack = player._startAttack;
  player._startAttack = function (def, ...args) {
    return startAttack.call(this, enabled ? temperedAttack(def) : def, ...args);
  };
  const [sx, sy, sz] = STUDY.scale;
  const prepare = () => {
    // Equipment changes rebuild the animator, but keep this same root / player.
    if (animator !== player.anim) {
      animator = player.anim;
      source = animator.poses;
      tempered = createTemperedPoses(source);
      installTemperedHands(animator, () => enabled);
    }
    animator.poses = enabled ? tempered : source;
  };
  prepare();
  root.updateMatrix = function () {
    updateMatrix.call(this);
    if (!enabled || !player.lean.on) return;
    // The existing matrix is lean × drawScale × rotation. Insert the audition's
    // world-axis proportions BEFORE lean, leaving travel in world metres.
    const e = this.matrix.elements, L = player.lean;
    for (let c = 0; c < 12; c += 4) {
      const y = e[c + 1], x = e[c] - L.k * L.dx * y, z = e[c + 2] - L.k * L.dz * y;
      e[c + 1] = y * sy;
      e[c] = x * sx + L.k * L.dx * y * sy;
      e[c + 2] = z * sz + L.k * L.dz * y * sy;
    }
  };
  player.unlean = function (v) {
    unlean.call(this, v);
    if (enabled) {
      const p = this.position;
      v.set(p.x + (v.x - p.x) / sx, p.y + (v.y - p.y) / sy, p.z + (v.z - p.z) / sz);
    }
    return v;
  };
  player.leanPoint = function (v) {
    if (enabled) {
      const p = this.position;
      v.set(p.x + (v.x - p.x) * sx, p.y + (v.y - p.y) * sy, p.z + (v.z - p.z) * sz);
    }
    return leanPoint.call(this, v);
  };
  player.update = function (dt) { prepare(); return update.call(this, dt); };
  return {
    get variant() { return enabled ? 'tempered' : 'current'; },
    select(id) {
      enabled = id === 'tempered';
      if (player.atk?.def) player.atk.def = enabled ? temperedAttack(player.atk.def) : originalAttack(player.atk.def);
      prepare();
      // A comparison click must not create a swept hit between differently sized blades.
      player.sweep.valid = false;
      root.updateMatrixWorld(true);
    },
  };
}
