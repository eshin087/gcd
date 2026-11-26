// STUB (the lead's placeholder; the body builder replaces this file). The remade hero's drawn body.
//
// THE INTERFACE (fixed: the engine and the showcase call exactly this):
//
//   const body = buildBody(game, { dims = HDIM, look } = {});
//   body.object3d            a THREE.Group. Whoever owns the hero places it (position = the root's ground
//                            point, rotation.y = his facing) and adds it to the scene. Everything the body
//                            draws hangs under it, in the skeleton's frame (+Z front, +Y up, +X his left).
//   body.setProp(side, kind) side 'R' | 'L'; kind 'sword' | 'flask' | null: what that hand's socket holds.
//   body.update(world, dt)   pose the parts from `world` (skeleton.js solveFK output, computed with the
//                            root at [0, 0, 0]: joint positions / rotations in object3d's frame), then
//                            run the cloth and hair. Called once a game step. Never throws, no allocations.
//   body.reset()             forget cloth velocities (after a teleport or a clip jump).
//   body.blade(side, a, b)   writes that hand's blade segment (THREE.Vector3 a = base, b = point) in WORLD
//                            space, from the last update; returns false when the hand holds no sword.
//   body.dispose()
import * as THREE from 'three';
import { HDIM } from './dims.js';

export function buildBody(game, { dims = HDIM } = {}) {
  const object3d = new THREE.Group();
  object3d.name = 'hero2';
  return {
    object3d,
    dims,
    setProp(side, kind) {},
    update(world, dt) {},
    reset() {},
    blade(side, a, b) { return false; },
    dispose() {},
  };
}
