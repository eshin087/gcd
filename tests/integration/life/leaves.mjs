// The fallen leaves' looks (`?leafLook=`, render/dragonLeaf.js; the litter's lying pieces: world/life/litter.js):
// its scenarios (tests/integration/life.mjs runs them once 'leaves' is in its FILES; T is its toolbox).
// Run: node tests/integration/life.mjs . leaves
//   '0' the letters (the pool) · 'a' the lens (one glyph lying flat, lit) · 'b' the cells (the ground's
//   lattice) · 'c' tiny house letters (a LetterBatch)

const AIR = 1, LYING = 2, FADE = 3;
const { LITTER } = await import(new URL('../../../src/world/life/litterTuning.js', import.meta.url).href);
const { setLook } = await import(new URL('../../../src/entities/enemies/duelist/lookSwitch.js', import.meta.url).href);
const { leafLook } = await import(new URL('../../../src/render/dragonLeaf.js', import.meta.url).href);
const WITH = (T) => T.LEVEL_IDS.filter((id) => !!LITTER.levels[id]);
const LOOKS = ['0', 'a', 'b', 'c'];

/** The pieces drawn as a look's leaves now: lying (or fading) records of a kind with a print block. */
const leafy = (L) => L.leaves.filter((f) => (f.s === LYING || f.s === FADE) && L.kinds[f.k].shape >= 0).length;
/** Every number a drawer was handed is finite. */
const finite = (arrs, n, k) => arrs.every((A) => { for (let i = 0; i < n * k; i++) if (!Number.isFinite(A[i])) return false; return true; });

export default {
  /** The default: the dragon print's pick ('a'); the switch moves it live. */
  look(T) {
    setLook('leafLook', null);
    T.assert(leafLook() === 'a', `the default leaf look is 'a' (${leafLook()})`);
    setLook('leafLook', 'c');
    T.assert(leafLook() === 'c', `?leafLook=c switches it`);
    setLook('leafLook', 'x');
    T.assert(leafLook() === '0', `an unknown option falls back to the letters`);
    setLook('leafLook', null);
  },

  /** Each look draws what lies its own way, and nothing of another look's; the air stays in the pool. */
  drawers(T) {
    const w = T.build('cinderwood', 'litter');
    const L = w.life.litter;
    w.step(4);
    for (const lk of LOOKS) {
      setLook('leafLook', lk);
      w.step(1 / 60);
      const n = leafy(L), air = L.leaves.filter((f) => f.s === AIR).length;
      const lens = L.lens?.geometry.instanceCount ?? 0, cells = L.printer?.geometry.instanceCount ?? 0, marks = L.marks?.count ?? 0;
      if (lk === '0') {
        T.assert(lens === 0 && cells === 0 && marks === 0, `0: no leaf drawer draws (${lens}, ${cells}, ${marks})`);
        T.assert(L.pool.count >= n * 0.9, `0: the pool draws what lies and falls (${L.pool.count} for ${n} lying + ${air} in the air)`);
      } else {
        const own = lk === 'a' ? lens : lk === 'b' ? cells : marks;
        const others = (lk === 'a' ? 0 : lens) + (lk === 'b' ? 0 : cells) + (lk === 'c' ? 0 : marks);
        T.assert(n > 40 && own >= n * 0.9 * (lk === 'c' ? 2 : 1), `${lk}: its drawer draws what lies (${own} for ${n} lying)`);
        T.assert(others === 0, `${lk}: the other looks' drawers draw nothing (${others})`);
        T.assert(L.pool.count <= air + 2, `${lk}: the pool keeps only what is in the air (${L.pool.count}, ${air} in the air)`);
        const D = lk === 'c' ? [L.marks.iPos.array, L.marks.iColor.array] : [(lk === 'a' ? L.lens : L.printer).iA.array, (lk === 'a' ? L.lens : L.printer).iC.array];
        T.assert(finite(D, own, lk === 'c' ? 3 : 4), `${lk}: no NaN handed to the drawer`);
        if (lk !== 'c') T.assert((lk === 'a' ? L.lens : L.printer).mesh.visible === true, `${lk}: its mesh is shown`);
      }
    }
    setLook('leafLook', null);
  },

  /** The look never moves the world: the same build under each look lays and drops the same pieces, and
   *  the living world's stream ends where it ends without the look (the drawers draw on their own). */
  sameLeaves(T) {
    const runs = [];
    for (const lk of LOOKS) {
      setLook('leafLook', lk);
      const w = T.build('cinderwood', 'all');
      w.walk(4, 0);
      w.step(3);
      w.walk(0, 0);
      w.step(3);
      runs.push({ lk, seed: w.life._seed, pos: w.life.litter.leaves.map((f) => `${f.s}:${f.x.toFixed(4)},${f.z.toFixed(4)}`).join(' '), random: w.counts().random });
    }
    for (const r of runs.slice(1)) {
      T.assert(r.pos === runs[0].pos, `${r.lk}: the same pieces lie and fall where they do under '0'`);
      T.assert(r.seed === runs[0].seed, `${r.lk}: the living world's stream is where it is under '0'`);
      T.assert(r.random === 0, `${r.lk}: no Math.random inside the living world (${r.random})`);
    }
    setLook('leafLook', null);
  },

  /** Off is free: the piece switched off leaves no leaf drawn by any look; the world hidden hides them. */
  off(T) {
    for (const lk of ['a', 'b', 'c']) {
      setLook('leafLook', lk);
      const w = T.build('cinderwood', 'litter');
      const L = w.life.litter;
      w.step(2);
      T.setLife('off');
      w.step(0.1);
      const lens = L.lens?.geometry.instanceCount ?? 0, cells = L.printer?.geometry.instanceCount ?? 0, marks = L.marks?.count ?? 0;
      T.assert(L.count === 0 && lens + cells + marks === 0, `${lk}: switched off, nothing drawn (${lens}, ${cells}, ${marks})`);
      T.assert(!(L.lens?.mesh.visible) && !(L.printer?.mesh.visible), `${lk}: the print's mesh is hidden`);
      T.setLife('litter');
      w.step(1);
      L.setVisible(false);
      w.step(0.1);
      T.assert(!(L.lens?.mesh.visible) && !(L.printer?.mesh.visible) && !(L.marks?.mesh.visible ?? false), `${lk}: the world hidden: the leaves hidden`);
      L.setVisible(true);
      w.step(0.1);
      T.assert(lk === 'c' ? L.marks.mesh.visible : (lk === 'a' ? L.lens : L.printer).mesh.visible, `${lk}: shown again`);
    }
    setLook('leafLook', null);
  },

  /** Every level with litter: under each look a few seconds of falling, lying and a run through, without a
   *  throw or a NaN; a kind with no print block (the ash) keeps its letters in the pool under every look. */
  levels(T) {
    for (const id of WITH(T)) {
      for (const lk of LOOKS) {
        setLook('leafLook', lk);
        const w = T.build(id, 'litter,wind,steps', { feet: true });
        w.walk(5, 0);
        w.step(2.5);
        w.walk(0, 0);
        w.step(1);
        const L = w.life.litter;
        const bad = L.leaves.filter((f) => f.s !== 0 && !(Number.isFinite(f.x + f.y + f.z + f.pl + f.pr + f.ps))).length;
        T.assert(bad === 0, `${id} ${lk}: no NaN in the pieces (${bad})`);
        const plain = L.leaves.filter((f) => (f.s === LYING) && L.kinds[f.k].shape < 0).length;
        if (lk !== '0' && plain > 0) T.assert(L.pool.count >= plain * 0.9, `${id} ${lk}: a kind with no print keeps its letters (${L.pool.count} for ${plain})`);
      }
    }
    setLook('leafLook', null);
  },
};
