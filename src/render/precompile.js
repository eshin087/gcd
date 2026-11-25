import * as THREE from 'three';

// THE SHADERS, COMPILED BEFORE THE FIRST FRAME (the loading screen's last step; main.js). Drawn the
// ordinary way, the first frame compiles each program the moment it first draws, one after another, and
// the GPU driver's compiler is slow on big programs (the art pass, the ground: seconds each on Windows'
// D3D): the owner saw "a really long time on shaders to load the game for the first time". Here every
// program the frame needs is started at once (WebGLRenderer.compile on each visible object, and on a
// full-screen quad per pipeline pass), so the driver compiles them side by side where it can
// (KHR_parallel_shader_compile), and the frame that follows finds them ready.
//
//   precompile(renderer, scene, camera, pipeline, maxMs)  → a promise: resolved when every program reports
//   ready, or after maxMs (the first frame then waits for the rest as before). Never rejects, never throws.
//
// Hidden objects (the 3D grass under the dragon print, a look not drawn) are left out: compiling them would
// only add work. Something shown later compiles when it first draws, as before.

export function precompile(renderer, scene, camera, pipeline, maxMs = 30000) {
  const mats = new Set();
  const add = (set) => {
    if (set) for (const m of set) mats.add(m);
  };
  try {
    if (typeof renderer?.compile !== 'function') return Promise.resolve(0);
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
      add(renderer.compile(o, camera, scene));
    });
    // the pipeline's passes: full-screen quads of their own materials (their programs depend on the
    // material only, not on what they are drawn on)
    if (pipeline) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
      const holder = new THREE.Scene();
      for (const k of Object.keys(pipeline)) {
        const m = pipeline[k];
        if (m?.isShaderMaterial) add(renderer.compile(new THREE.Mesh(geo, m), camera, holder));
      }
    }
  } catch (err) {
    console.warn('[precompile] skipped', err);
  }
  const props = renderer?.properties;
  const t0 = performance.now();
  const n = mats.size;
  return new Promise((resolve) => {
    const check = () => {
      try {
        for (const m of mats) {
          const p = props?.get(m)?.currentProgram;
          if (!p || p.isReady()) mats.delete(m);
        }
      } catch {
        mats.clear();
      }
      if (!mats.size || performance.now() - t0 > maxMs) {
        resolve(n);
        return;
      }
      setTimeout(check, 16);
    };
    check();
  });
}
