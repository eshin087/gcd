import * as THREE from 'three';

// THE IMPACT RIPPLE: the struck body's own letters take the blow. Round the drawn contact its cells
// are shoved along the blade's travel on screen, re-roll their letters and brighten a little, at a
// ring front that runs out from the contact through the body, for a few frames of fx time (it plays
// through the hit-stop while the fighters hold the frame). Calm beats loud: a light cut's ripple is
// felt more than seen, a cleave's is unmistakable.
//
// Two halves, as the heat haze has (STYLE.md "Text effects"):
//   - here: a small fixed set of live hits (RIPPLE.slots; a new hit takes a free slot, else the
//     oldest), each kept in WORLD space and riding with the struck boss (the offset from his root
//     at the hit: a duelist's shove is instant), projected every frame with the camera that draws
//     it (the camera punches and kicks on a hit) into the ASCII pass's uniforms;
//   - the ASCII pass (render/pipeline.js rippleCell): per letter cell of a BOSS (the wyrm's art
//     grid, FLAG.ART; the human bosses' ink-line grid, the hero-art path's boss half) the ring's
//     weight at that cell, which shoves the letter, re-rolls a share of the cells and lifts their
//     ink. The hero, the props, the floor, the grass and the HUD never read it.
// The pass reads nothing while no ripple is live (uRipN = 0).
//
// No randomness here (the shader's per-cell hash picks which letters re-roll), no allocation per
// frame, nothing throws: every number is checked before it reaches a uniform.

/** The tuning (content is data). Reach and ring width are in letter CELLS of the grid the struck
 *  body prints on (the wyrm's art cell, a duelist's own cell); times are fx seconds. */
export const RIPPLE = {
  /** live hits at once (a three-cut chain inside 0.5 s, the flurry); the shader's array size */
  slots: 4,
  /** per attack tier (combat.js `contact`): reach = cells the ring front runs out to, dur = its
   *  life, shove = px a letter at the front is pushed along the cut (rounded: 1 px reads, 2 px is a
   *  blow), gain = how hard the front re-rolls and lifts the letters it crosses */
  tiers: {
    light: { reach: 7, dur: 0.14, shove: 1.3, gain: 0.7 },
    sweep: { reach: 8, dur: 0.15, shove: 1.4, gain: 0.75 },
    point: { reach: 6, dur: 0.13, shove: 1.6, gain: 0.75 },
    slam: { reach: 13, dur: 0.19, shove: 2.4, gain: 1.0 },
    cleave: { reach: 14, dur: 0.2, shove: 2.5, gain: 1.0 },
    execute: { reach: 16, dur: 0.22, shove: 2.6, gain: 1.1 },
  },
  /** a crit / a broken foe: reach and gain x this */
  crit: 1.15,
  /** the cleave's charge (o.power 0..1) adds this share of reach and life */
  power: 0.25,
  /** how k (the piece's strength) scales the reach: reach x (1 - kReach + kReach x k) */
  kReach: 0.5,
  /** the front's half-width over its reach (cells), and its least half-width */
  width: 0.2,
  widthMin: 1.3,
  /** the front's life curve: radius = reach x (1 - (1 - t)^ease), strength = (1 - t)^fade */
  ease: 2.2,
  fade: 1.4,
  /** the ASCII pass's shared terms (uRip): x = share of the cells at full weight that re-roll,
   *  y = brightness gain at full weight, z = depth window (m): cells this much nearer or farther
   *  than the contact fade out (another part of the scene behind it on screen), w = a neutral lift
   *  of the letters' ink at full weight (dark scales still show the front) */
  pass: { roll: 0.6, bright: 0.65, depth: 6.0, lift: 0.04 },
};

const fin = Number.isFinite;

export class ImpactRipple {
  constructor(game) {
    this.game = game;
    /** Hits drawn so far (tests). */
    this.n = 0;
    /** Live hits this frame. */
    this.live = 0;
    // the slots: world contact (or the offset from the target's root), the cut, the life
    this.slots = Array.from({ length: RIPPLE.slots }, () => ({
      on: false,
      age: 0,
      dur: 1,
      reach: 1,
      shove: 0,
      gain: 0,
      k: 0,
      target: null,
      p: new THREE.Vector3(), // world contact, or the offset from target.position
      cut: new THREE.Vector3(), // the blade's travel (unit; NaN-free: zero = unknown)
      seq: 0,
    }));
    this._seq = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    // the ASCII pass reads these (pipeline.setRipple hands them over)
    game?.pipeline?.setRipple?.(this);
  }

  /** One landed cut at (x, y, z), the drawn contact; `o`: combat/impact.js; `k`: the strength. */
  hit(x, y, z, o, k = 1) {
    if (!(k > 0) || !fin(x + y + z)) return;
    const T = RIPPLE.tiers[o?.tier] ?? RIPPLE.tiers.light;
    let s = null;
    for (const c of this.slots) if (!c.on) { s = c; break; }
    if (!s) {
      s = this.slots[0];
      for (const c of this.slots) if (c.seq < s.seq) s = c;
    }
    const crit = o?.crit ? RIPPLE.crit : 1;
    const pw = o?.tier === 'cleave' && fin(o?.power) ? Math.min(1, Math.max(0, o.power)) * RIPPLE.power : 0;
    s.on = true;
    s.age = 0;
    s.seq = ++this._seq;
    s.k = k;
    s.dur = T.dur * (1 + pw);
    s.reach = T.reach * crit * (1 + pw) * (1 - RIPPLE.kReach + RIPPLE.kReach * k);
    s.shove = T.shove * k;
    s.gain = T.gain * crit * k;
    const tg = o?.target;
    const tp = tg?.position;
    if (tp && fin(tp.x + tp.y + tp.z)) {
      s.target = tg;
      s.p.set(x - tp.x, y - tp.y, z - tp.z);
    } else {
      s.target = null;
      s.p.set(x, y, z);
    }
    const c = o?.cut;
    if (c && fin(c.x + c.y + c.z) && c.x * c.x + c.y * c.y + c.z * c.z > 1e-6) s.cut.set(c.x, c.y, c.z).normalize();
    else s.cut.set(0, 0, 0);
    this.n++;
    this.live = this._count();
    const pipe = this.game?.pipeline;
    if (pipe) this.write(pipe);
  }

  /** Per frame, on fx time (it runs on through a hit-stop). Must not throw or allocate. */
  update(dt) {
    const d = dt > 0 && fin(dt) ? dt : 0;
    for (const s of this.slots) {
      if (!s.on) continue;
      s.age += d;
      if (s.age >= s.dur) { s.on = false; s.target = null; }
    }
    this.live = this._count();
    const pipe = this.game?.pipeline;
    if (pipe) this.write(pipe);
  }

  /** Drop every running ripple (a level reset). */
  clear() {
    for (const s of this.slots) { s.on = false; s.target = null; s.age = 0; }
    this.live = 0;
    const u = this.game?.pipeline?.asciiMat?.uniforms;
    if (u?.uRipN) u.uRipN.value = 0;
  }

  _count() {
    let n = 0;
    for (const s of this.slots) if (s.on) n++;
    return n;
  }

  /**
   * Project the live hits into the ASCII pass's uniforms with the pipeline's camera (called by
   * update and again by the pipeline right before the pass, after the camera's last move).
   * uRipA[i] = (contact px x, y, front radius in cells, weight), uRipB[i] = (shove px x, y, front
   * half-width in cells, contact view depth m); the live ones first, uRipN = how many.
   */
  write(pipe) {
    const u = pipe?.asciiMat?.uniforms;
    const cam = pipe?.camera;
    if (!u?.uRipA || !u.uRipB || !u.uRipN) return;
    const W = pipe.width, H = pipe.height;
    if (!cam || !(W > 0) || !(H > 0) || this.live === 0) { u.uRipN.value = 0; return; }
    const A = u.uRipA.value, B = u.uRipB.value;
    const v = this._v, w = this._w;
    let n = 0;
    for (const s of this.slots) {
      if (!s.on) continue;
      const tp = s.target?.position;
      w.copy(s.p);
      if (s.target && tp && fin(tp.x + tp.y + tp.z)) w.add(tp);
      // view depth (the pass's linDepth: distance along the view axis)
      v.copy(w).applyMatrix4(cam.matrixWorldInverse);
      const dz = -v.z;
      if (!(dz > 0.05)) continue;
      v.copy(w).project(cam);
      const x = (v.x * 0.5 + 0.5) * W, y = (v.y * 0.5 + 0.5) * H;
      if (!fin(x + y)) continue;
      // the cut's direction on screen (half a metre of it), y up like gl_FragCoord
      let dx = 0, dy = 0;
      if (s.cut.x !== 0 || s.cut.y !== 0 || s.cut.z !== 0) {
        v.copy(s.cut).multiplyScalar(0.5).add(w).project(cam);
        dx = (v.x * 0.5 + 0.5) * W - x;
        dy = (v.y * 0.5 + 0.5) * H - y;
        const l = Math.hypot(dx, dy);
        if (l > 1e-3 && fin(l)) { dx /= l; dy /= l; } else { dx = 0; dy = 0; }
      }
      const t = Math.min(1, Math.max(0, s.age / s.dur));
      const R = s.reach * (1 - Math.pow(1 - t, RIPPLE.ease));
      const env = Math.pow(1 - t, RIPPLE.fade);
      const hw = Math.max(RIPPLE.widthMin, s.reach * RIPPLE.width);
      A[n].set(x, y, R, env * s.gain);
      B[n].set(dx * s.shove * env, dy * s.shove * env, hw, dz);
      if (++n >= A.length) break;
    }
    u.uRipN.value = n;
  }
}
