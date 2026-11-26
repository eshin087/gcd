// The body stand (`?hero2=body`): the remade hero's body (body.js) beside today's hero in the level,
// a metre or two to his side, his facing, following him; posed by solveFK from hand-set test poses
// (bodyPoses.js). For look checks (the parity sheets, the close sheets, the cloth films).
// Contract: `mount(game, params)` is called once after the player exists (params: the page's
// URLSearchParams) and returns `{ update(dt) }`, called every game step after the player's update.
//
// Console (`__game.hero2body`):
//   pose(name)            one of `poses` (T, stand, guard, lunge, crouch, roll, overhead, twoHand, ride,
//                         run, paired); `stand` is today's idle at ease, joint for joint
//   offset(x, z)          where the stand is from today's hero, in his frame (m; +x his left, +z ahead)
//   follow(on)            follow him (default) or stay where it is
//   place(x, z, yaw)      put it there (follow off); move it every tick for a film
//   dims('alt' | table)   rebuild the body on another dimension table ('alt': limbs +8 %, shoulders +6 %;
//                         'base' / null: HDIM)
//   spec(s)               pose it from a spec of your own (bodyPoses.js authorPose)
//   body, world, B        the body, the solved world, the derived sizes
// URL: `?h2pose=<name>` the first pose, `?h2dims=alt` the alternative table.
import { HDIM } from './dims.js';
import { createWorld, restOffsets, solveFK, createPose } from './skeleton.js';
import { buildBody } from './body.js';
import { authorPose, POSES } from './bodyPoses.js';

/** HDIM with every limb 8 % longer and the shoulders 6 % wider (the parametric check). */
export function altDims(d = HDIM) {
  const k = 1.08, s = 1.06;
  const o = { ...d };
  for (const n of ['upperArm', 'foreArm', 'palm', 'thigh', 'shin', 'foot']) o[n] = d[n] * k;
  o.clav = (d.clavIn + d.clav) * s - d.clavIn;
  o.hipsY = d.hipDrop + o.thigh + o.shin + d.ankle;
  o.height = d.height + (o.hipsY - d.hipsY);
  return o;
}

export function mount(game, params) {
  const st = { name: params?.get('h2pose') || 'stand', ox: 1.4, oz: 0, follow: true, x: 0, z: 0, yaw: Math.PI };
  let dims = params?.get('h2dims') === 'alt' ? altDims() : HDIM;
  let body = null, rest = null, pose = null;
  const world = createWorld();

  const build = () => {
    body?.dispose();
    body = buildBody(game, { dims });
    game.scene.add(body.object3d);
    rest = restOffsets(dims);
    setPose(st.name);
  };
  const applyProps = (P) => {
    body.setProp('R', P?.props?.R ?? 'sword');
    body.setProp('L', P?.props?.L ?? null);
    body.setHand('R', P?.hands?.R ?? null);
    body.setHand('L', P?.hands?.L ?? null);
  };
  const setPose = (name) => {
    const P = POSES[name];
    if (!P) return false;
    st.name = name;
    pose = P.spec ? authorPose(P.spec, dims) : createPose(dims);
    applyProps(P);
    body.reset();
    return true;
  };
  const place = () => {
    const o = body.object3d, p = game.player;
    if (st.follow && p) {
      const y = p.yaw ?? 0, c = Math.cos(y), s = Math.sin(y);
      o.position.set(p.position.x + st.ox * c + st.oz * s, p.position.y, p.position.z - st.ox * s + st.oz * c);
      o.rotation.set(0, y, 0);
    } else {
      o.position.set(st.x, Number.isFinite(st.lift) ? st.lift : 0, st.z); // (lift: a film's drop)
      o.rotation.set(0, st.yaw, 0);
    }
  };
  build();

  game.hero2body = {
    get body() {
      return body;
    },
    get world() {
      return world;
    },
    get B() {
      return body.B;
    },
    poses: Object.keys(POSES),
    pose: (name) => setPose(name),
    spec(s) {
      pose = authorPose(s, dims);
      body.reset();
    },
    offset(x, z = 0) {
      st.ox = x;
      st.oz = z;
      st.follow = true;
    },
    follow(on = true) {
      st.follow = !!on;
    },
    place(x, z, yaw = st.yaw) {
      st.follow = false;
      st.x = x;
      st.z = z;
      st.yaw = yaw;
    },
    dims(t) {
      dims = t === 'alt' ? altDims() : t && typeof t === 'object' ? t : HDIM;
      build();
      return dims;
    },
    state: st,
  };

  return {
    update(dt) {
      if (!body || !pose) return;
      place();
      solveFK(pose, rest, world);
      body.update(world, dt);
    },
  };
}
