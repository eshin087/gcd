import { LIFE } from './lifeSwitch.js';

// HANDING THE LETTERS TO THE GPU, the living world's fast path (`LIFE.fast`, `?lifeFast=0` turns it off).
//
// Today a batch marks its whole instance arrays dirty every frame, so three.js sends the GPU every slot the
// batch could ever hold (a mist batch of 1 400 letters sends 62 KB to draw 77), and a batch with nothing in
// it is still drawn (its program set, its uniforms sent, a draw of 0). The fast path sends only the first
// n instances (one range per attribute: the letters drawn this frame, which are always the first n), and an
// empty batch leaves the frame: its mesh's layer mask is 0, so three.js passes it over before any work. The
// picture is the same: the GPU draws the same n letters from the same numbers.
//
//   ship(mesh, n, a, b, c, d)   after the owner wrote n instances into attributes a.. (d optional): fast
//                               path on: the ranges [0, n) and the mask; off: today's whole-array upload
//                               (needsUpdate; the mask as it was). Returns whether the fast path ran.
//   unship(mesh)                the mask back (an empty batch, or the fast path switched off)
//
// The mask is the mesh's own (layers.mask) and nothing else in the living world writes it: an owner's
// `mesh.visible` (the Lab hiding the world, a piece off) is left alone and still wins.

const MASK = '__lifeMask';
const RANGE = '__lifeRange';

/** The mesh's mask as built (kept the first time the fast path hides it). */
function maskOf(mesh) {
  const u = mesh.userData;
  if (u[MASK] === undefined) u[MASK] = mesh.layers.mask;
  return u[MASK];
}

export function unship(mesh) {
  if (!mesh?.layers) return;
  const u = mesh.userData;
  if (u[MASK] !== undefined && mesh.layers.mask !== u[MASK]) mesh.layers.mask = u[MASK];
}

const range = (a, n) => {
  if (!a) return;
  // (one range record per attribute, kept: addUpdateRange would make a new one every frame)
  const R = a.updateRanges, r = (a[RANGE] ??= { start: 0, count: 0 });
  r.start = 0;
  r.count = n * a.itemSize;
  R.length = 0;
  R.push(r);
  a.needsUpdate = true;
};
const whole = (a) => {
  if (!a) return;
  if (a.updateRanges?.length) a.clearUpdateRanges();
  a.needsUpdate = true;
};

/**
 * The owner wrote n instances into a, b, c (and d): hand them over. Off the fast path this is today's
 * code (every attribute's whole array, the batch drawn even when empty), unless `always` is false:
 * then, as LeafPrint does today, nothing is marked while n is 0.
 */
export function ship(mesh, n, a, b, c, d, always = true) {
  // (every batch the living world hands over is marked: BENCH leaves them out, dev/perfReadout.js)
  if (mesh?.userData && mesh.userData.lifeBatch !== true) mesh.userData.lifeBatch = true;
  if (!LIFE.fast || !mesh?.layers) {
    if (mesh) unship(mesh);
    if (always || n > 0) {
      whole(a);
      whole(b);
      whole(c);
      whole(d);
    }
    return false;
  }
  const m = maskOf(mesh);
  if (n > 0) {
    if (mesh.layers.mask !== m) mesh.layers.mask = m;
    range(a, n);
    range(b, n);
    range(c, n);
    range(d, n);
  } else if (mesh.layers.mask !== 0) {
    // (nothing to draw: out of the frame until there is; what the GPU holds is never drawn again
    //  before the next n > 0 sends its own first n)
    mesh.layers.mask = 0;
  }
  return true;
}
