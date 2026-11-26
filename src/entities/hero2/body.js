// The remade hero's drawn body (the experiment behind `?hero=new`): today's hero's look, rebuilt on
// the new skeleton (skeleton.js) and sized from a dimension table (dims.js HDIM, through bodyLook.js).
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
//
// Beyond the interface (optional, for the engine and the dev stand):
//   body.setHand(side, shape) 'fist' | 'open' | null (null: a fist round a prop, else open). A hand on
//                            the grip with no prop of its own (two hands on one sword) is setHand(L, 'fist').
//   body.hot                 0..1, how lit the blade is (a strike's window: 1). The engine sets it; the
//                            steel is dark at rest and lights while it cuts, like today's (player.js).
//   body.blade(side, a, b, drawn)  drawn = true: the DRAWN segment (the lean and the drawn scale in it);
//                            default: the gameplay segment (no lean, no drawn scale, what hits test).
//   body.materials, body.mats, body.batch, body.cloth, body.lean, body.B (the derived sizes)
//
// How it is drawn: the SAME materials as today's hero (model.js createHeroMaterials, the player's own
// `self` letter grid: one hero art path, one look), rigid parts on every joint (bodyParts.js), merged
// per joint and material and batched (render/rigidBatch.js: one draw call per material), the camera
// lean and the drawn scale of today's (model.js installLean, PLAYER_SCALE), the letters sized by the
// camera distance (setHeroGlyphScale), the cloak and the coat tails on spring chains (cloth.js).
import * as THREE from 'three';
import { HDIM } from './dims.js';
import { J, JOINTS, JI } from './skeleton.js';
import { buildParts } from './bodyParts.js';
import { Cloth } from './cloth.js';
import { createHeroMaterials, setHeroGlyphScale, installLean, LEAN, PLAYER_SCALE, BLADE_BASE } from '../player/model.js';
import { mergeGeometries } from '../player/heroGeo.js';
import { batchRigid } from '../../render/rigidBatch.js';
import { markCaster } from '../../render/pipeline.js';

/** The engine reads this to know the real body draws (the lead's stub had none). */
export const BODY_READY = true;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

export function buildBody(game, { dims = HDIM, look = {} } = {}) {
  const U = game.U;
  const M = createHeroMaterials(U, { self: look.self ?? true });
  const object3d = new THREE.Group();
  object3d.name = 'hero2';
  const { parts, strands, B } = buildParts(dims);

  // one holder per joint (flat under the group: posed straight from solveFK's world)
  const holders = JOINTS.map((n) => {
    const o = new THREE.Object3D();
    o.name = 'h2.' + n;
    object3d.add(o);
    return o;
  });
  // the parts, merged per joint, material and tag (a tagged group is shown / hidden as one)
  const groups = new Map();
  for (const p of parts) {
    const key = `${p.bone}|${p.mat}|${p.tag ?? ''}`;
    let gr = groups.get(key);
    if (!gr) groups.set(key, (gr = { ...p, list: [] }));
    gr.list.push(p.geo);
  }
  const tagged = { R: { open: [], fist: [], sword: [], flask: [] }, L: { open: [], fist: [], sword: [], flask: [] } };
  for (const gr of groups.values()) {
    const mat = M[gr.mat];
    if (!mat) continue;
    const mesh = new THREE.Mesh(gr.list.length > 1 ? mergeGeometries(gr.list) : gr.list[0], mat);
    mesh.name = `h2.${gr.bone}.${gr.mat}`;
    holders[JI[gr.bone]].add(mesh);
    if (gr.tag) {
      const side = gr.bone.endsWith('R') ? 'R' : 'L';
      tagged[side][gr.tag]?.push(mesh);
    }
  }
  // the cloth's stretches: one holder each, its geometry merged per material
  for (const st of strands) {
    st.holders = st.segs.map((seg, i) => {
      const h = new THREE.Object3D();
      h.name = `h2.${st.name}.${i}`;
      object3d.add(h);
      const byMat = new Map();
      for (const { mat, geo } of seg.geos) {
        const l = byMat.get(mat) ?? [];
        l.push(geo);
        byMat.set(mat, l);
      }
      for (const [mat, list] of byMat) if (M[mat]) h.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], M[mat]));
      return h;
    });
  }
  const cloth = new Cloth(strands, B.g, dims.blade);

  // drawn like today's player: the lean toward the camera and the drawn scale, a shadow caster, batched
  const lean = installLean(object3d, look.scale ?? PLAYER_SCALE);
  markCaster(object3d);
  object3d.updateMatrixWorld(true);
  const batch = batchRigid(U, object3d);
  const mats = Object.values(M);

  // per-side state
  const prop = { R: 'sword', L: null }, hand = { R: null, L: null };
  const showProps = () => {
    for (const s of ['R', 'L']) {
      const T = tagged[s], k = prop[s];
      const fist = hand[s] ? hand[s] === 'fist' : !!k;
      for (const m of T.sword) m.visible = k === 'sword';
      for (const m of T.flask) m.visible = k === 'flask';
      for (const m of T.fist) m.visible = fist;
      for (const m of T.open) m.visible = !fist;
    }
    cloth.setBlades(prop.R === 'sword', prop.L === 'sword');
  };
  showProps();

  // the last pose's sockets (the blade's segment) and the drawn-look state
  const sock = new Float32Array(2 * 7); // per side: p xyz, r xyzw (body frame)
  const v = new THREE.Vector3(), q = new THREE.Quaternion();
  let time = 0, settle = true, viewDist = 36;
  const wind = () => game.world?.life?.wind ?? null;

  const body = {
    object3d, dims, B, materials: M, mats, batch, cloth, lean, holders,
    hot: 0,
    setProp(side, kind) {
      if (side !== 'R' && side !== 'L') return;
      prop[side] = kind === 'sword' || kind === 'flask' ? kind : null;
      showProps();
    },
    setHand(side, shape) {
      if (side !== 'R' && side !== 'L') return;
      hand[side] = shape === 'fist' || shape === 'open' ? shape : null;
      showProps();
    },
    update(world, dt) {
      try {
        if (!world?.p || !world?.r) return;
        const P = world.p, R = world.r;
        for (let j = 1; j < J; j++) {
          const x = P[j * 3], y = P[j * 3 + 1], z = P[j * 3 + 2];
          if (!Number.isFinite(x + y + z + R[j * 4] + R[j * 4 + 1] + R[j * 4 + 2] + R[j * 4 + 3])) continue;
          const h = holders[j];
          h.position.set(x, y, z);
          h.quaternion.set(R[j * 4], R[j * 4 + 1], R[j * 4 + 2], R[j * 4 + 3]);
        }
        for (let s = 0; s < 2; s++) {
          const j = s ? JI.weaponL : JI.weaponR;
          for (let k = 0; k < 3; k++) sock[s * 7 + k] = P[j * 3 + k];
          for (let k = 0; k < 4; k++) sock[s * 7 + 3 + k] = R[j * 4 + k];
        }
        const w = wind();
        if (settle) {
          cloth.settle(world, object3d, w);
          settle = false;
        } else cloth.step(world, object3d, dt, w);
        cloth.draw();
        const t = Number.isFinite(dt) && dt > 0 ? dt : 0;
        time += t;
        body._view(t);
      } catch (e) {
        // (never freeze the frame: CLAUDE.md)
        if (!body._warned) console.warn('[hero2] body.update:', e);
        body._warned = true;
      }
    },
    /** the lean, the letter size, the blade's and the gem's light (player.js _updateLean / _updateMaterials at rest) */
    _view(dt) {
      const cam = game.camera;
      lean.k = 0;
      if (cam?.matrixWorld) {
        const e = cam.matrixWorld.elements;
        const fx = -e[8], fy = -e[9], fz = -e[10], hh = Math.hypot(fx, fz);
        if (hh > 1e-3 && Number.isFinite(fy)) {
          const a = Math.min(LEAN.max, Math.max(0, LEAN.frac * Math.atan2(-fy, hh)));
          lean.k = Math.tan(a);
          lean.dx = fx / hh;
          lean.dz = fz / hh;
        }
        const p = object3d.position, c = cam.position;
        const d = Math.hypot(c.x - p.x, c.y - p.y - 1.1, c.z - p.z);
        if (Number.isFinite(d)) {
          viewDist = d;
          setHeroGlyphScale(mats, d);
        }
      }
      const far = smooth(10, 28, viewDist);
      const restInk = 0.6 + 1.0 * far;
      const hot = Math.min(1, Math.max(0, Number.isFinite(body.hot) ? body.hot : 0));
      let ink = restInk + 0.08 * Math.sin(time * 2.6), glow = 1.45 + 0.15 * Math.sin(time * 3.7);
      ink += (Math.max(1.6, restInk + 0.3) - ink) * hot;
      glow += (Math.max(1.45, 1.5) - glow) * hot;
      const bu = M.blade.uniforms, tu = M.bladeTip.uniforms;
      bu.uInkGlow.value = dt > 0 ? damp(bu.uInkGlow.value, ink, 18, dt) : ink;
      bu.uGlow.value = dt > 0 ? damp(bu.uGlow.value, glow, 14, dt) : glow;
      tu.uInkGlow.value = bu.uInkGlow.value + 0.3;
      tu.uGlow.value = bu.uGlow.value;
      bu.uGlyphZoom.value = tu.uGlyphZoom.value = 0.72 - 0.26 * far;
      bu.uBase.value.setRGB(BLADE_BASE[0] + 0.2 * far, BLADE_BASE[1] + 0.36 * far, BLADE_BASE[2] + 0.5 * far);
      const gu = M.gem.uniforms, gt = 0.8 + 0.25 * Math.sin(time * 2.1);
      gu.uGlow.value = dt > 0 ? damp(gu.uGlow.value, gt, 10, dt) : gt;
      gu.uInkGlow.value = 0.45 + 0.4 * gu.uGlow.value;
    },
    reset() {
      settle = true;
    },
    blade(side, a, b, drawn = false) {
      const s = side === 'L' ? 1 : 0;
      if (prop[side === 'L' ? 'L' : 'R'] !== 'sword' || !a || !b) return false;
      const o = s * 7;
      q.set(sock[o + 3], sock[o + 4], sock[o + 5], sock[o + 6]);
      const put = (out, len) => {
        v.set(0, 0, len).applyQuaternion(q);
        out.set(sock[o] + v.x, sock[o + 1] + v.y, sock[o + 2] + v.z);
        if (drawn) {
          object3d.updateMatrix();
          out.applyMatrix4(object3d.matrix);
          if (object3d.parent) out.applyMatrix4(object3d.parent.matrixWorld);
        } else {
          out.applyQuaternion(object3d.quaternion).add(object3d.position);
          if (object3d.parent && object3d.parent.type !== 'Scene') out.applyMatrix4(object3d.parent.matrixWorld);
        }
      };
      put(a, dims.bladeBase);
      put(b, dims.bladeTip);
      return Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z);
    },
    dispose() {
      batch?.dispose?.();
      object3d.removeFromParent();
      object3d.traverse((o) => o.geometry?.dispose?.());
      for (const m of mats) m.dispose?.();
    },
  };
  return body;
}
