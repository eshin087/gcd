import * as THREE from 'three';
import { CONFIG } from '../../core/config.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';
import { DEFENSE } from '../../combat/rules.js';
import { STREAK_FX, streakK, streakTier } from '../../combat/streak.js';
import { FlurryFx } from './flurryFx.js';
import { burstLook } from './flurryBurst.js';

// The flurry (ADR-091; rules: DEFENSE.flurry, docs/COMBAT.md → "The streak and the flurry"): what a
// perfect dodge that can reach its attacker turns into. As many blows as the streak counts: FLASH
// CUTS first (a blink to one side of the target, a dash through it, gone again; each along a new
// line, so the cuts cross on it and hang there), then an ART, the last blow, on which the hanging
// cuts burst. Player state 'flurry'; the plunge (player.js) is the wyrm's first art and runs in its
// own state, as it always has: the flurry only leads into it.
//
// Two kinds of target:
//   air     an attacker that offers the plunge (plungePoint / onPlunge: the wyrm). The cuts fly
//           round its head; the last blow lands through onPlunge and he comes down through the
//           plunge's own flip and landing.
//   ground  a foe with a body to cut (takeHit: a duelist). The cuts run through him on the ground;
//           the last blow is his takeHit ({ exact }) and leaves the hero behind him (his
//           `ghostepBehind`), in the Ghostep's reappear, the crit window open.
//
// Time: while it runs the world is held at DEFENSE.flurry.world of its speed (a hit-stop, re-armed
// every frame) and the hero moves on REAL time (game.realDt): its clocks, the animator and the cloth.
// Every blow freezes him too for a moment (`freeze`), the impact frame.

const F = DEFENSE.flurry;
const G = F.ground; // the cuts against a foe on the ground (a duelist)
const S = F.storm; // the storm: a long flurry's later cuts, each faster than the last (streakK('storm'))
const TP = F.tempo; // the storm's tempo: heavy first, then faster by ratio (STREAK_FX.tempo)
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const CHEST = 1.2; // m above his root the blade crosses a target at
const KEEP = 0.05; // s: the world's hold is re-armed for this long every frame
const MIN_Y = 0.15; // an airborne pass never skims lower than this
const AIR_PULL = 3.5; // m: the cuts round the wyrm's head are drawn this far toward the camera (flurryFx.js `pull`)

/** Phases (player.flurry.ph). */
export const FP = Object.freeze({ BLINK: 0, DASH: 1, HOLD: 2, COIL: 3, STRIKE: 4, AFTER: 5 });

/**
 * The arts: the last blow's looks. One is picked at random for each flurry (the animator's noise,
 * never the game's RNG), never the same twice running; `player.debug.flurryArt` pins one.
 *   kind 'plunge'  the plunge itself (player.js): above the head, the dive, the ride, the backflip
 *        'iai'     he appears to one side in a deep draw (`coil` s), crosses the target in one
 *                  straight line (`strike` s) and holds the finish with his back to it (`hold` s):
 *                  only then does the cut land
 *        'split'   he appears `up` m above it, `back` m to the near side, the blade raised, and
 *                  cleaves down through it to the ground on the far side
 *        'vault'   he appears crouched right before the foe, cuts upward and goes over him in a
 *                  somersault (apex `up` m) to land behind
 * Lengths in m, times in real seconds.
 */
export const ARTS = Object.freeze({
  skyfall: { air: true, kind: 'plunge', label: 'Skyfall' },
  severing: { air: true, kind: 'iai', label: 'Severing Line', coil: 0.22, strike: 0.075, hold: 0.24, back: 5.4, out: 5.4 },
  heavensplit: { air: true, kind: 'split', label: 'Heaven Splitter', coil: 0.2, strike: 0.13, up: 4.6, back: 2.4 },
  passing: { air: false, kind: 'iai', label: 'Passing Cut', coil: 0.22, strike: 0.1, hold: 0.24, back: 3.1 },
  falling: { air: false, kind: 'split', label: 'Falling Leaf', coil: 0.2, strike: 0.12, up: 3.9, back: 1.5 },
  rising: { air: false, kind: 'vault', label: 'Rising Moon', coil: 0.16, strike: 0.4, back: 1.3, up: 2.5 },
  // the riposte (a parried last blow): no art of its own. Every blow is a flash cut, the last one
  // opens the hanging cuts, and he is back where he parried
  riposte: { air: null, kind: 'return', label: 'Riposte' },
  // the counter (ADR-118; a parried blue flare blow): the riposte's cuts, the last one the counter
  // blow (DEFENSE.flareCounter)
  counter: { air: null, kind: 'return', label: 'Counter' },
});
const AIR_ARTS = Object.keys(ARTS).filter((k) => ARTS[k].air === true);
const GROUND_ARTS = Object.keys(ARTS).filter((k) => ARTS[k].air === false);
// a flash cut plays one of the hero's own swings through its active frames (swings.js): never two
// along the same line in a row
const CUT_CLIPS = ['drawCut', 'fallingBackhand', 'risingSlash', 'flatBackhand', 'fallingCut', 'risingBackhand'];
/** A ground cut's run, 0..1 of the dash → 0..1 of the path: in fast to the contact (`hitPos` of
 *  the way at `hitAt`), out of it faster still and slowing into the finish. */
function groundEase(v) {
  if (v < G.hitAt) return G.hitPos * Math.pow(v / G.hitAt, 1.6);
  const w = (v - G.hitAt) / (1 - G.hitAt);
  return G.hitPos + (1 - G.hitPos) * (1 - Math.pow(1 - w, 2.4));
}
const SPLIT_AT = 0.55; // of a split's strike: where its path crosses the target
const VAULT_HIT = 0.14; // of a vault's strike: the rising cut lands
const VAULT_FLIP = 0.3; // … and from here he is in the somersault

export class Flurry {
  constructor(player, tune) {
    this.p = player;
    this.tune = tune;
    this.fx = new FlurryFx(player.game, player.fx);
    this.on = false; // state 'flurry' is running
    this.pending = false; // cuts are hanging, waiting for the last blow (which may be the plunge's)
    this.att = null;
    this.air = false;
    this.n = 1; // blows in all
    this.cuts = 0; // how many of them are flash cuts (all but the art; all of a riposte's)
    this.riposte = false;
    this.counter = false; // a riposte whose last cut is the counter blow (a parried blue flare blow)
    this.reelT = 0; // s (real) left of the beat after a cut in which the target reels
    // the streak pass: read once as a flurry starts
    this.streakN = 1; // the streak it answers (raw: it counts on past the cap of blows)
    this.tier = 0; // streakTier(streakN)
    this.stormK = 0; // streakK('storm'): 0 = every cut paced as before the storm
    this.tempo = false; // the storm's tempo (STREAK_FX.tempo, with the storm on): heavy first, then by ratio
    this._r = 1; // the tempo's ratio for this flurry
    // the chain (STREAK_FX.chain, DEFENSE.flurry.chain): every pass starts where the one before ended
    this.chain = false;
    this._planS = new Int8Array(F.max + 1); // the chain's plan: each flash cut's side (+1 / -1) ...
    this._planOff = new Float32Array(F.max + 1); // ... and how far off the target's middle it passes (m)
    this.planGap = 1; // the plan's smallest |sin| between two of its lines (tests)
    this._planA0 = NaN; // the plan: the angle round the target the first cut starts at
    this.planNodes = 0; // the plan's search steps (tests)
    this._pa = new Float64Array(F.max + 1); // the search's path: each line's heading, side, off
    this._ps = new Int8Array(F.max + 1);
    this._po = new Float64Array(F.max + 1);
    this.C0 = new THREE.Vector3(); // where an art's coil starts (with the chain: where the last cut ended)
    this._artChain = false; // this art runs from where the last cut ended (the chain, N > 1)
    this._from = { ox: 0, oz: 0 }; // the plunge's "came from" with the chain: where he is
    this._sw = new Float32Array(3 * 12); // an art's blade path through its strike (the chain's crescent)
    this._swN = 0;
    this._q = new THREE.Vector3();
    this.lastHitT = -1; // the real clock at the last blow (the gap the HUD and the sound are told)
    this.clock = 0; // s (real) since the flurry started
    this._seq = 0; // counts phase changes (the storm runs on through a frame while phases end)
    this._cloneAt = false; // a storm cut landed this frame: its clone is printed once he is posed
    this.cloned = false; // this pass has left its speed clone
    this.hang = 0; // of a ground cut's dash: the part he is seen wound up in before he moves
    this.i = 0; // the blow being struck (0-based)
    this.ph = FP.BLINK;
    this.t = 0;
    this.dur = 0.05;
    this.freeze = 0; // s (real) the hero holds his pose: a blow's impact frame
    this.hit = false; // this blow has landed
    this.glinted = false; // the coil's star has shown
    this.hidden = false; // between two blinks: not drawn
    this.art = 'skyfall';
    this.lastArt = { air: '', ground: '' };
    this.attack = null;
    this.tell = 'normal';
    this.ox = 0;
    this.oz = 0;
    this.ang = 0;
    this.yaw0 = 0; // his heading as an art's strike starts (the vault turns him round from it)
    this.clipI = 0;
    this.total = 0; // damage dealt so far
    this.animDt = 0; // the animator's step this frame (real time; 0 through a freeze)
    this.glow = 0; // 0..1: the blade's blaze (the coil winds it up)
    this.T = new THREE.Vector3(); // the target point: the head's middle / his chest
    this.A = new THREE.Vector3(); // this beat's path: from …
    this.B = new THREE.Vector3(); // … to
    this.X = new THREE.Vector3(); // … through (a split)
    this.d = { x: 0, z: 1 }; // the beat's heading (unit, ground plane)
    this._v = new THREE.Vector3();
    this._w = { x: 0, y: 0, z: 0, ok: false }; // where he was last frame (the wake's direction)
    // the hanging cuts: world segments at the blade's height, `k` = how much of it is drawn yet
    this.lines = Array.from({ length: F.max + 1 }, () => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, k: 0, last: false }));
    this.nLines = 0;
    /** What the animator reads (anim.js flurryPose): pose 'cut' (a swings.js `clip` at phase `u`,
     *  1..2 = its cut) | 'coil' | 'raise' | 'crouch' | 'flip' (u 0..1), `air` = off the ground. */
    this.anim = { pose: 'cut', clip: 'drawCut', u: 1, air: false, k: 0 };
  }

  // ------------------------------------------------------------------ what can it reach
  /** 'air' | 'ground' | null: can a flurry reach `att` from where the hero stands? `allowPlunge`:
   *  the hit lets a plunge-offering attacker be plunged (hazards do not). */
  reach(att, allowPlunge = true) {
    const P = this.p, p = P.position;
    if (!att) return null;
    if (P._plungeable(att)) {
      if (!allowPlunge || !P._plungePoint(att, this._v)) return null;
      return Math.hypot(this._v.x - p.x, this._v.z - p.z) <= DEFENSE.plunge.range ? 'air' : null;
    }
    const ap = att.position;
    if (typeof att.takeHit !== 'function' || !ap || !Number.isFinite(ap.x + ap.z) || !this._alive(att)) return null;
    return Math.hypot(ap.x - p.x, ap.z - p.z) <= this.tune.ghostepMaxRange ? 'ground' : null;
  }

  _alive(att) {
    if (!att) return false;
    if (att.state === 'dying' || att.state === 'dead' || att.state === 'sleeping') return false;
    return att.mode !== 'dying' && att.mode !== 'dead';
  }

  /** The target point this frame → this.T (false: it is gone). */
  _aim() {
    const P = this.p, att = this.att, T = this.T;
    if (!this._alive(att)) return false;
    if (this.air) {
      if (!P._plungeable(att) || !P._plungePoint(att, T)) return false;
      T.y = Math.max(0.6, T.y - 0.55); // the plunge point is the top of the skull: its middle
      return true;
    }
    const ap = att.position;
    if (!ap || !Number.isFinite(ap.x + ap.z)) return false;
    let ok = false;
    try {
      ok = typeof att.lockPoint === 'function' && !!att.lockPoint(T) && Number.isFinite(T.x + T.y + T.z);
    } catch (err) {
      console.error('[flurry] lockPoint failed', err);
    }
    if (!ok) T.set(ap.x, 1.25, ap.z);
    // (his chest leans with his pose: the cuts cross where he STANDS, at chest height)
    T.x = ap.x;
    T.z = ap.z;
    T.y = clamp(T.y, 0.9, 1.7);
    return true;
  }

  /** The art for this flurry: pinned (debug), else at random, never the last one again. */
  _pickArt(air) {
    const P = this.p, list = air ? AIR_ARTS : GROUND_ARTS, key = air ? 'air' : 'ground';
    const pin = P.debug?.flurryArt;
    let art = typeof pin === 'string' && ARTS[pin] && ARTS[pin].air === air ? pin : null;
    if (!art) {
      const pool = list.filter((k) => k !== this.lastArt[key]);
      art = pool[Math.min(pool.length - 1, Math.floor(P.anim.noise() * pool.length))] ?? list[0];
    }
    this.lastArt[key] = art;
    return art;
  }

  // ------------------------------------------------------------------ start / end
  /**
   * Answer a perfect dodge of `att` with `strikes` blows (reach(): `air`). False when it cannot
   * start (the caller falls back to the Ghostep). One blow whose art is the plunge IS the plunge,
   * started as it always was.
   */
  start(att, air, strikes, attack, tell, opts = null) {
    const P = this.p, g = P.game, p = P.position;
    const riposte = !!opts?.riposte, counter = riposte && !!opts?.counter;
    this.att = att;
    this.air = !!air;
    if (!this._aim()) return false;
    const n = clamp(Math.round(fin(strikes, 1)), 1, F.max);
    // the streak it answers counts on past the cap of blows: the tiers (looks only) read it
    const streakN = Math.max(n, Math.round(fin(strikes, 1)), 1);
    const art = counter ? 'counter' : riposte ? 'riposte' : this._pickArt(this.air);
    if (n === 1 && ARTS[art].kind === 'plunge') {
      this.clear();
      this.art = art;
      this.n = 1;
      if (!P._startPlunge(att, false, attack, tell)) return false;
      P._emit('player:flurry', { strikes: 1, art, air: true, dur: DEFENSE.ghostep.slowmoTime });
      return true;
    }
    this.clear();
    this.att = att;
    this.air = !!air;
    this.art = art;
    this.n = n;
    this.riposte = riposte;
    this.counter = counter;
    this.cuts = riposte ? n : n - 1;
    this.streakN = streakN;
    this.tier = streakTier(streakN);
    this.stormK = streakK('storm');
    this.tempo = this.stormK > 0 && STREAK_FX.tempo !== false;
    // (the tempo's ratio: the more cuts it paces, the faster each falls off the one before)
    this._r = lerp(TP.ratio[0], TP.ratio[1], clamp((this._paced() - 2) / 4, 0, 1));
    this.chain = STREAK_FX.chain !== false;
    this.fx.chain = this.chain;
    this._swN = 0;
    this.clock = 0;
    this.lastHitT = -1;
    this.fx.setTier(this.tier, streakK('tiers'));
    this.attack = attack;
    this.tell = tell;
    this.ox = p.x;
    this.oz = p.z;
    if (this.chain) this._planChain();
    this.on = true;
    this.pending = true;
    this.fx.pull = this.air ? AIR_PULL : 0;
    this.fx.k = this.air ? 1 : G.fx;
    // the first line: from the side he dodged on
    this.ang = Math.atan2(this.ox - this.T.x, this.oz - this.T.z);
    if (!Number.isFinite(this.ang)) this.ang = P.yaw + Math.PI;

    const nSegs = P._sampleGhost(); // the afterimage left where he dodged
    P.vel.x = P.vel.z = P.kb.x = P.kb.z = 0;
    P.want.x = P.want.z = 0;
    P.groundVel.x = P.groundVel.z = 0;
    P.atk = null;
    P.chargeK = 0;
    P.blockStunT = 0;
    P.buf.action = null;
    P.critTimer = 0; // reopened by the last blow
    P.iframeT = 0;
    P.assist.target = null;
    P.assist.t = 0;
    P._enter('flurry', 'flurry', 0);
    this.fx.vanish(P._ghostSegs, nSegs, p.x, p.y, p.z);
    this.hidden = true;
    // (the tempo: the blink before the heavy beat is its own; a lone art's is as before)
    this._phase(FP.BLINK, this.tempo && this.cuts > 0 ? this._beat().blink : F.cut.blink);
    g.shake?.(0.15);
    // the camera leans in on the target for as long as the cuts take (no slow-mo of its own: the
    // world's hold is the flurry's)
    // (the zoom is in metres at the desktop distance: scaled for the phone's closer camera)
    const zk = fin(g.cameraRig?.defaultDistance, CONFIG.camera.distance) / CONFIG.camera.distance;
    g.flow?.cinematic?.({ x: this.T.x, z: this.T.z, slowmo: 1, dur: this._planned() + 0.5, zoom: (this.air ? -3 : G.zoom) * zk, weight: 0.55, kind: 'flurry' });
    this._hold();
    if (!riposte) {
      P._emit('player:perfectDodge', { attack, tell, streak: P.streak });
      P._emit('player:ghostep', { x: p.x, z: p.z });
    }
    // (extra fields for the HUD and the sound: the streak it answers, its tier, the real time each
    // flash cut's contact is planned at from now (`at`), and whether its later cuts are a storm)
    P._emit('player:flurry', { strikes: n, art, air: this.air, dur: this._planned(), streak: streakN, tier: this.tier, storm: this._stormStep(this.cuts - (riposte ? 2 : 1)) > 0, at: this._plannedHits() });
    return true;
  }

  /** Real seconds the flurry's blows take, about (the camera's lean, the screen's cold cast). */
  _planned() {
    const C = F.cut, D = ARTS[this.art];
    let t = 0;
    for (let i = 0; i < this.cuts; i++) t += this._cutTime(i);
    return t + C.blink + (D.kind === 'plunge' ? 0.7 : D.kind === 'return' ? 0.1 : fin(D.coil) + fin(D.strike) + fin(D.hold) + 0.15);
  }

  /** Real seconds flash cut `i` takes, about (its blink before it to its held finish). */
  _cutTime(i) {
    const C = F.cut, p = this._pace(i);
    if (this.tempo) {
      // (the tempo: the blink before cut i is paced as cut i; a storm cut has no wind-up seen)
      const B = this._beat();
      return (B.blink + (this._stormStep(i) > 0 ? 0 : B.hang) + B.dash + B.hold) * p + this._stop(i);
    }
    if (this._stormStep(i) > 0) return (this.air ? C.blink + C.dash + C.hold : C.blink + G.dash + G.hold) * p + this._stop(i);
    return (this.air ? C.blink + C.dash + C.stop + C.hold : C.blink + G.hang + G.dash + C.stop + G.hold) * p;
  }

  /** The real time from now each flash cut is planned to land at (about: the frames round it up). */
  _plannedHits() {
    const out = [], C = F.cut;
    let t = 0;
    for (let i = 0; i < this.cuts; i++) {
      const p = this._pace(i), st = this._stormStep(i) > 0;
      let to;
      if (this.tempo) {
        const B = this._beat();
        to = B.blink + (st ? 0 : B.hang) + B.dash * (this.air ? 0.5 : G.hitAt);
      } else to = this.air ? C.blink + C.dash * 0.5 : st ? C.blink + G.dash * G.hitAt : C.blink + (G.hang + G.dash) * (this._hangShare() + (1 - this._hangShare()) * G.hitAt);
      out.push(+(t + to * p).toFixed(3));
      t += this._cutTime(i);
    }
    return out;
  }

  /** The tempo's beats of a cut at pace 1 (DEFENSE.flurry.tempo: on the ground / in the air). */
  _beat() {
    return this.air ? TP.air : TP.ground;
  }

  /** How many flash cuts the tempo paces: a flurry's all, a riposte's all but its last blow. */
  _paced() {
    return Math.max(0, this.riposte ? this.cuts - 1 : this.cuts);
  }

  /** Is cut `i` a riposte's (or a counter's) last blow? */
  _final(i) {
    return this.riposte && i >= this.cuts - 1;
  }

  _hangShare() {
    return G.hang / (G.hang + G.dash);
  }

  /** The pace before the storm: a long flurry speeds up (cut `i`: 1 → DEFENSE.flurry.cut.rush). */
  _basePace(i) {
    const m = this.cuts - 1;
    return m > 0 ? lerp(1, this.air ? F.cut.rush : G.rush, clamp(i / m, 0, 1)) : 1;
  }

  /** How many cuts are shown before the storm (DEFENSE.flurry.storm.shown: round the head / on the ground). */
  _shown() {
    return Math.max(1, (this.air ? S.shown.air : S.shown.ground) | 0);
  }

  /** 0: cut `i` is shown (paced as before the storm); 1, 2, ...: how far into the storm it is. */
  _stormStep(i) {
    // (a riposte's last cut is its last blow: paced and weighed as a shown cut; with the tempo, as
    // the heavy beat)
    if (!(this.stormK > 0) || this._final(i)) return 0;
    if (this.tempo) {
      // the tempo: a storm cut is one whose pace has fallen under `stormAt` (the paces only fall,
      // so the storm cuts are the last ones): how many up to and including i
      if (!(this._pace(i) < TP.stormAt)) return 0;
      let s = 0;
      for (let j = 0; j <= i; j++) if (this._pace(j) < TP.stormAt) s++;
      return s;
    }
    return Math.max(0, i - this._shown() + 1);
  }

  /** The pace of cut `i` (x its beats). The storm: each cut past the shown ones takes `fall` (^ k)
   *  of the time of the one before, never less than `floor`. The tempo: every cut takes the ratio
   *  (^ k) of the one before, from the heavy beat (pace 1), never less than `floor`. */
  _pace(i) {
    if (this.tempo) return this._final(i) ? 1 : Math.max(S.floor, Math.pow(this._r, this.stormK * i));
    const s = this._stormStep(i);
    if (s <= 0) return this._basePace(i);
    return Math.max(S.floor, this._basePace(this._shown() - 1) * Math.pow(S.fall, this.stormK * s));
  }

  /** 0 for a shown cut, else 0..1 how deep into the storm cut `i` is (its last cut 1). */
  _storm(i) {
    const s = this._stormStep(i), m = this._stormStep(this.cuts - (this.riposte ? 2 : 1));
    return s > 0 && m > 0 ? s / m : 0;
  }

  /** The freeze on cut `i`'s contact (real s). A storm cut's is short, but at least a frame: he is
   *  drawn on the target as it lands. */
  _stop(i) {
    const p = this._pace(i);
    if (this.tempo) return this._stormStep(i) > 0 ? Math.max(S.stopMin, this._beat().stop * p) : this._beat().stop * p;
    if (this._stormStep(i) > 0) return Math.max(S.stopMin, F.cut.stop * p);
    return F.cut.stop * (0.75 + 0.25 * p);
  }

  /** The weight of cut `i` with the tempo: 1 at pace 1 down to 0 at the storm's threshold (the
   *  camera's kick and shake, the flare and the sparks fall with it); 1 without the tempo. */
  _weight(i) {
    if (!this.tempo || this._final(i)) return 1;
    return clamp((this._pace(i) - TP.stormAt) / (1 - TP.stormAt), 0, 1);
  }

  /** Keep the world held (a hit-stop at DEFENSE.flurry.world, re-armed for KEEP s). The scale is
   *  SET, not merged: a target's own freeze on a cut (0.03 for 0.12 s) must not stand for the whole
   *  flurry, and in the beat after a cut the world is let run (`reelWorld`) so the target reels. */
  _hold() {
    const g = this.p.game;
    if (typeof g.hitstop !== 'function') return;
    g.hitstop(KEEP, F.world);
    g.hitstopScale = this.reelT > 0 ? fin(F.reelWorld, F.world) : F.world;
  }

  _phase(ph, dur) {
    this.ph = ph;
    this._seq++;
    this.t = 0;
    this.dur = Math.max(1e-3, fin(dur, 0.05));
  }

  /** Drop everything (a respawn, a reset, a new flurry). */
  clear() {
    this.on = false;
    this.pending = false;
    this.hidden = false;
    this.nLines = 0;
    this.freeze = 0;
    this.total = 0;
    this.i = 0;
    this.hit = false;
    this.riposte = false;
    this.counter = false;
    this.cuts = 0;
    this.reelT = 0;
    this.glow = 0;
    this.animDt = 0;
    this._cloneAt = false;
    this.anim.pose = 'cut';
    this.anim.air = false;
  }

  // ------------------------------------------------------------------ the frame
  /** Player state 'flurry' (dt: game time; the flurry runs on real time). */
  tick(dt) {
    const P = this.p, g = P.game, p = P.position;
    P.want.x = P.want.z = 0;
    P.vel.x = P.vel.z = P.kb.x = P.kb.z = 0;
    const rdt = dt > 0 ? clamp(fin(g.realDt, dt) * fin(g.debugTimeScale, 1), 0, 0.05) : 0;
    this.animDt = rdt;
    if (!this.on) {
      // (a state left over without a flurry: never stuck)
      P._toLoco(0.1);
      return;
    }
    if (this.reelT > 0) this.reelT -= rdt;
    this.clock += rdt;
    this._hold();
    let budget = rdt;
    if (this.freeze > 0) {
      this.freeze -= rdt;
      this.animDt = 0;
      // (a storm cut's freeze is a frame: what is left of this frame runs on into the cut's finish)
      if (this.freeze > 0 || !this._stormy()) return;
      budget = -this.freeze;
      this.freeze = 0;
      this.animDt = budget;
    }
    // The storm (DEFENSE.flurry.storm): a storm cut's beats can be shorter than a frame. The frame
    // then runs on through them (a blink, the pass) until he lands a blow (drawn on the target, in the
    // freeze) or comes into a cut's held finish (drawn there): so every blow still lands in a frame
    // of its own, he is drawn where it lands, and the cuts come a few frames apart, no slower.
    // Everything else steps once a frame, as it always has.
    for (let it = 0; it < 8; it++) {
      const storm = this._stormy(), seq = this._seq, ph0 = this.ph;
      this.t += budget;
      const over = this.t - this.dur;
      this._step(clamp(this.t / this.dur, 0, 1), rdt);
      if (!storm || !this.on || this.freeze > 0 || this._seq === seq || !(over > 1e-6)) break;
      if (this.ph === FP.HOLD && ph0 === FP.DASH) break; // drawn in the finish
      if (this.ph !== FP.BLINK && this.ph !== FP.DASH && this.ph !== FP.HOLD) break; // (the art's beats run a frame at a time)
      budget = over;
    }
    if (!Number.isFinite(p.x + p.y + p.z)) {
      p.set(fin(this.ox, CONFIG.world.playerSpawn.x), 0, fin(this.oz, CONFIG.world.playerSpawn.z));
      this._bail();
    }
  }

  /** Is the beat now a storm cut's (its blink, its pass, its finish)? */
  _stormy() {
    return this.i < this.cuts && this._stormStep(this.i) > 0 && (this.ph === FP.BLINK || this.ph === FP.DASH || this.ph === FP.HOLD);
  }

  /** One step of the beat now, at `u` (0..1) of it. */
  _step(u, rdt) {
    const P = this.p, p = P.position;
    switch (this.ph) {
      case FP.BLINK:
        if (u >= 1) {
          if (this.i < this.cuts) this._beginCut();
          else this._beginArt();
        }
        break;
      case FP.DASH: {
        // in the air: straight through the head. On the ground (`ground`): seen wound up where he
        // appeared, in fast to the contact, then slowing into the finish
        // (with the tempo the air cut is seen wound up too: `hang` > 0 round the head as well)
        const storm = this._stormStep(this.i) > 0;
        let v = this.hang > 0 ? clamp((u - this.hang) / (1 - this.hang), 0, 1) : u;
        const hitV = this.air ? 0.5 : G.hitAt;
        if (storm && !this.hit && v >= hitV) {
          // (a storm cut: held on the contact, never past it, in the frame the blow lands)
          v = hitV;
          this.t = this.dur * (this.hang + (1 - this.hang) * hitV);
        }
        const e = this.air ? v : groundEase(v);
        p.lerpVectors(this.A, this.B, e);
        this.anim.u = 1 + v;
        const L = this.lines[this.nLines - 1];
        if (L) L.k = e;
        if (!storm && !this.cloned && this.air && v >= 0.3) {
          // a speed clone: the shape of him mid-pass, left hanging on the line
          this.cloned = true;
          this.fx.clone(P._ghostSegs, P._sampleGhost());
        }
        if (!this.hit && v >= hitV) {
          if (storm) {
            // the clone of a storm cut is printed once he is posed on the contact (draw)
            this.cloned = true;
            this._cloneAt = true;
          } else if (!this.air) {
            // on the ground the clone is the strike itself: the pose he cut in, left beside the foe
            this.cloned = true;
            this.fx.clone(P._ghostSegs, P._sampleGhost());
          }
          this._cutHit();
          if (storm) break;
        }
        if (u >= 1) this._phase(FP.HOLD, (this.tempo ? this._beat().hold : this.air ? F.cut.hold : G.hold) * this._pace(this.i));
        break;
      }
      case FP.HOLD:
        this.anim.u = 2 + 0.25 * u;
        if (u >= 1) {
          // (with the tempo the blink before a cut is paced as that cut; the art's as before)
          if (this.tempo && this.i + 1 < this.cuts) this._vanish(this._beat().blink * this._pace(this.i + 1));
          else {
            // (after the storm, the art comes out of a whole blink: the storm is seen to end)
            const toArt = this._stormStep(this.i) > 0 && !(this.i + 1 < this.cuts && this._stormStep(this.i + 1) > 0);
            this._vanish(F.cut.blink * (toArt ? 1 : this._pace(this.i)));
          }
        }
        break;
      case FP.COIL:
        this._tickCoil(u, rdt);
        break;
      case FP.STRIKE:
        this._tickStrike(u);
        break;
      case FP.AFTER:
      default:
        this._tickAfter(u);
    }
  }

  /** Leave an afterimage where he stands and be gone for `blink` s; the next blow follows. */
  _vanish(blink) {
    const P = this.p, p = P.position;
    const n = P._sampleGhost();
    this.fx.vanish(P._ghostSegs, n, p.x, p.y, p.z, true, this.d.x, this.d.z, this.i < this.cuts ? this._storm(this.i) : 0);
    this.hidden = true;
    this.i++;
    this._phase(FP.BLINK, blink);
  }

  /** He is at a new spot this frame: the pose, the cloth and the blade's sweep start over. */
  _appear(pose, clip, u, blend = 0) {
    const P = this.p, A = this.anim;
    this.hidden = false;
    A.pose = pose;
    A.clip = clip;
    A.u = u;
    A.air = P.position.y > 0.05;
    A.k = 0;
    P.object3d.rotation.y = P.yaw;
    P.anim.play('flurry', blend);
    P.anim.teleported();
    P.sweep.valid = false;
    P.ghostFx = 0.5; // the cold cast he resolves out of
  }

  // ------------------------------------------------------------------ the flash cuts
  /** A line for the next cut: turned from the far end of the last one, clear of the lines already
   *  hanging and (in the air) of the wyrm's neck, where a pass would run through its body. */
  _nextAngle() {
    const P = this.p, base = this.ang;
    if (this.nLines === 0) return this._offNeck(base);
    if (this._stormStep(this.i) > 0) return this._stormAngle(base);
    let best = base, bestGap = -1;
    for (let k = 0; k < 6; k++) {
      const a = base + Math.PI + (k % 2 ? -1 : 1) * lerp(F.turn[0], F.turn[1], P.anim.noise());
      let gap = Math.PI;
      for (let j = 0; j < this.nLines; j++) {
        const L = this.lines[j];
        const la = Math.atan2(L.ax - L.bx, L.az - L.bz);
        gap = Math.min(gap, Math.abs(Math.sin(a - la))); // lines have no direction
      }
      gap = Math.min(gap, this._neckGap(a));
      if (gap > bestGap) {
        bestGap = gap;
        best = a;
      }
      if (gap > 0.45) break;
    }
    return best;
  }

  /** A storm cut's line: he is too fast to be followed from one end to the next, so the line is the
   *  one that best fills the star: the widest gap to every line hanging, clear of the neck. */
  _stormAngle(base) {
    let best = base + Math.PI, bestGap = -1;
    for (let k = 0; k < 24; k++) {
      // (every line through the target, 7.5 degrees apart, nearest the far end of the last first)
      const a = base + Math.PI + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 24);
      let gap = Math.PI;
      for (let j = 0; j < this.nLines; j++) {
        const L = this.lines[j];
        gap = Math.min(gap, Math.abs(Math.sin(a - Math.atan2(L.ax - L.bx, L.az - L.bz))));
      }
      gap = Math.min(gap, this._neckGap(a));
      if (gap > bestGap + 1e-6) {
        bestGap = gap;
        best = a;
      }
    }
    return best;
  }

  /** |sin| of the angle between heading `a` and the neck's line (1 = across it; 1 on the ground). */
  _neckGap(a) {
    if (!this.air) return 1;
    const ap = this.att?.position;
    if (!ap || !Number.isFinite(ap.x + ap.z)) return 1;
    const nx = ap.x - this.T.x, nz = ap.z - this.T.z;
    if (nx * nx + nz * nz < 1) return 1;
    return Math.abs(Math.sin(a - Math.atan2(nx, nz)));
  }

  /** Heading `a`, turned off the neck's line if it runs along it. */
  _offNeck(a) {
    if (this._neckGap(a) >= 0.55) return a;
    const ap = this.att.position, neck = Math.atan2(ap.x - this.T.x, ap.z - this.T.z);
    const side = Math.sin(a - neck) >= 0 ? 1 : -1, front = Math.cos(a - neck) >= 0 ? 0 : Math.PI;
    return neck + front + side * (front ? -0.7 : 0.7);
  }

  _beginCut() {
    const P = this.p, p = P.position, g = P.game, T = this.T;
    if (!this._aim()) {
      this._bail();
      return;
    }
    if (this.chain) {
      if (!this._chainPath()) {
        this._bail();
        return;
      }
      this._cutStarts();
      return;
    }
    const a = this._nextAngle();
    this.ang = a;
    const dx = Math.sin(a), dz = Math.cos(a);
    const A = this.A, B = this.B;
    let lineY = T.y;
    if (this.air) {
      const R = F.reach.air, cy = T.y - CHEST;
      // each pass climbs or dives a little across the head
      const tilt = (this.i % 2 ? -1 : 1) * lerp(0.3, 1.2, P.anim.noise());
      A.set(T.x + dx * R, Math.max(MIN_Y, cy + tilt), T.z + dz * R);
      B.set(T.x - dx * R, Math.max(MIN_Y, cy - tilt), T.z - dz * R);
    } else {
      // past his side, never through him: the path runs `side` m off the line the cut is drawn on
      // (each cut on the other side of him)
      const R = G.reach, bound = CONFIG.world.playerBound, sd = (this.i % 2 ? -1 : 1) * G.side;
      A.set(T.x + dx * R + dz * sd, 0, T.z + dz * R - dx * sd);
      B.set(T.x - dx * R + dz * sd, 0, T.z - dz * R - dx * sd);
      g.world?.resolve?.(A, P.radius, bound, false, 'hero');
      g.world?.resolve?.(B, P.radius, bound, false, 'hero');
      if (!Number.isFinite(A.x + A.z + B.x + B.z)) {
        this._bail();
        return;
      }
      A.y = B.y = 0;
      lineY = T.y;
    }
    this.d.x = -dx;
    this.d.z = -dz;
    p.copy(A);
    P.yaw = Math.atan2(B.x - A.x, B.z - A.z);
    const L = this.lines[this.nLines++];
    if (this.air) {
      L.ax = A.x;
      L.az = A.z;
      L.bx = B.x;
      L.bz = B.z;
    } else {
      // the cut hangs ON him: a short line through where he stands
      L.ax = T.x + dx * G.line;
      L.az = T.z + dz * G.line;
      L.bx = T.x - dx * G.line;
      L.bz = T.z - dz * G.line;
    }
    L.ay = this.air ? A.y + CHEST : lineY;
    L.by = this.air ? B.y + CHEST : lineY;
    L.k = 0;
    L.last = false;
    L.hold = false; // (the time rip's tear holds a line back until it splits: timeRip.js)
    this._cutStarts();
  }

  /** The chain (DEFENSE.flurry.chain): this pass's path → A, B, its heading → d, him at A facing B,
   *  its hanging line the path his chest runs. The first starts on the side he dodged on (as before),
   *  every later one where he stands: where the last one ended. False: no finite path. */
  _chainPath() {
    const P = this.p, p = P.position, g = P.game, T = this.T, A = this.A, B = this.B;
    const R = this.air ? F.reach.air : G.reach, cy = T.y - CHEST;
    if (this.nLines === 0) {
      const a = Number.isFinite(this._planA0) ? this._planA0 : this._offNeck(Math.atan2(this.ox - T.x, this.oz - T.z));
      A.set(T.x + Math.sin(a) * R, 0, T.z + Math.cos(a) * R);
      if (this.air) A.y = Math.max(MIN_Y, cy + lerp(0.3, 1.2, P.anim.noise()));
      else g.world?.resolve?.(A, P.radius, CONFIG.world.playerBound, false, 'hero');
    } else A.copy(p);
    if (!this.air) A.y = 0;
    this._chainExit(A, B, R);
    // (round the head each pass climbs or dives a little: it ends above the middle, then below, ...)
    B.y = this.air ? Math.max(MIN_Y, cy + (this.i % 2 ? 1 : -1) * lerp(0.3, 1.2, P.anim.noise())) : 0;
    if (!Number.isFinite(A.x + A.y + A.z + B.x + B.y + B.z)) return false;
    const ex = B.x - A.x, ez = B.z - A.z, el = Math.hypot(ex, ez);
    if (el > 1e-3) {
      this.d.x = ex / el;
      this.d.z = ez / el;
    }
    this.ang = Math.atan2(-this.d.x, -this.d.z);
    p.copy(A);
    P.yaw = Math.atan2(this.d.x, this.d.z);
    // (the slash he leaves: exactly the path his chest runs, A to B, CHEST m over his root)
    this._line(A, B, CHEST);
    return true;
  }

  /**
   * The chain's plan, made as the flurry starts (DEFENSE.flurry.chain): where round the target the
   * first cut starts, and for every flash cut the side it passes the target on (+1 / -1) and how far
   * off its middle (m) -> this._planA0 / _planS / _planOff. A depth-first search over the whole run
   * (the target where it stands now, every pass from `reach` out to `reach` out beyond it), pruned
   * by its bound (the spread only shrinks and the costs only grow as cuts are added), at most
   * `nodes` steps: the lines spread like a star as widely as they can (the wyrm's neck kept clear), no
   * pass ends near his dodge spot, on the ground the art then not either and the last cut ends before
   * the foe's face, the turns keep their way. Once a flurry, never a frame of its own; no allocation
   * past the closures below.
   */
  _planChain() {
    const T = this.T, C = F.chain, offs = this.air ? C.off.air : C.off.ground, R = this.air ? F.reach.air : G.reach;
    const n = Math.min(this.cuts, this._planS.length);
    this._planA0 = NaN;
    this.planGap = 1;
    if (!(n > 0)) return;
    const D = ARTS[this.art], toArt = D.kind !== 'return', ox = this.ox - T.x, oz = this.oz - T.z;
    const fy = fin(this.att?.yaw, NaN), ffx = Math.sin(fy), ffz = Math.cos(fy), behind = fin(this.att?.ghostepBehind, 1.5);
    const o0 = Math.atan2(ox, oz);
    // (round the head the passes end about CHEST under its middle: metres over the dodge spot)
    const dy = this.air ? Math.max(0, T.y - CHEST) : 0;
    const k2 = C.keepOff * C.keepOff - dy * dy;
    const near = (x, z) => (x - ox) * (x - ox) + (z - oz) * (z - oz) < k2;
    const cap = C.gap, bonus = this.air ? 0 : C.front;
    // (the neck's heading, once: _neckGap's, inlined)
    const ap = this.att?.position, nx = ap ? ap.x - T.x : 0, nz = ap ? ap.z - T.z : 0;
    const hasNeck = this.air && !!ap && Number.isFinite(nx + nz) && nx * nx + nz * nz >= 1, neck = hasNeck ? Math.atan2(nx, nz) : 0;
    const A = this._pa, S = this._ps, O = this._po;
    let best = -Infinity, nodes = 0;
    const take = (a0, gap, pen) => {
      const sc = Math.min(gap, cap) - pen + 0.01 * gap;
      if (!(sc > best + 1e-9)) return;
      best = sc;
      this._planA0 = a0;
      this.planGap = gap;
      for (let k = 0; k < n; k++) {
        this._planS[k] = S[k];
        this._planOff[k] = O[k];
      }
    };
    const dfs = (k, x, z, a0, gap, pen, turn) => {
      if (nodes++ > C.nodes) return;
      const r = Math.max(0.3, Math.hypot(x, z)), base = Math.atan2(-x, -z), last = k === n - 1;
      for (let si = 0; si < 2; si++) {
        const sg = (si ? -1 : 1) * (turn || 1); // (the same way as the last turn first)
        for (let q = 0; q < offs.length; q++) {
          const off = Math.min(offs[q], r * 0.85), a = base + sg * Math.asin(off / r);
          const run = Math.sqrt(Math.max(0, r * r - off * off)) + Math.sqrt(Math.max(0, R * R - off * off));
          const ex = x + Math.sin(a) * run, ez = z + Math.cos(a) * run;
          let p2 = pen;
          if (near(ex, ez)) p2 += C.near;
          if (turn && sg !== turn) p2 += C.same;
          let g2 = hasNeck ? Math.min(gap, Math.abs(Math.sin(a - neck))) : gap;
          for (let j = 0; j < k; j++) g2 = Math.min(g2, Math.abs(Math.sin(a - A[j])));
          // (the bound: nothing added later widens the spread or lowers the costs, but the front)
          if (!(Math.min(g2, cap) - p2 + 0.01 * g2 + bonus > best + 1e-9)) continue;
          A[k] = a;
          S[k] = sg;
          O[k] = offs[q];
          if (!last) {
            dfs(k + 1, ex, ez, a0, g2, p2, sg);
            continue;
          }
          if (toArt) {
            const el = Math.max(0.3, Math.hypot(ex, ez)), ux = -ex / el, uz = -ez / el;
            if (!this.air) {
              if (Number.isFinite(fy) && ex * ffx + ez * ffz > 0) p2 -= C.front;
              if (near(ux * behind, uz * behind)) p2 += C.artNear;
            } else if (D.kind === 'iai' && hasNeck && Math.abs(Math.sin(Math.atan2(ux, uz) - neck)) < 0.55) p2 += C.artNeck;
          }
          take(a0, g2, p2);
        }
      }
    };
    // (the first cut starts on the side he dodged on, turned a little either way if that spreads the
    // star better: `start`, rad; never along the wyrm's neck)
    for (let q = 0; q < C.start.length; q++) {
      const a0 = this._offNeck(o0 + C.start[q]);
      dfs(0, Math.sin(a0) * R, Math.cos(a0) * R, a0, 1, 0.001 * q, 0);
    }
    this.planNodes = nodes;
  }

  /** The chain: where the pass from A ends (-> out, y 0): past the target on the side and as far off
   *  its middle as planned (_planChain), `R` m beyond it; on the ground resolved against the walls. */
  _chainExit(A, out, R) {
    const P = this.p, g = P.game, T = this.T, offs = this.air ? F.chain.off.air : F.chain.off.ground;
    let tx = T.x - A.x, tz = T.z - A.z;
    const r = Math.max(0.3, Math.hypot(tx, tz));
    if (Math.hypot(tx, tz) > 0.3) {
      tx /= r;
      tz /= r;
    } else {
      tx = Math.sin(P.yaw);
      tz = Math.cos(P.yaw);
    }
    const k = Math.min(this.i, this._planS.length - 1), sg = this._planS[k] || 1;
    const off = Math.min(fin(this._planOff[k], offs[0]) || offs[0], r * 0.85);
    const a = Math.atan2(tx, tz) + sg * Math.asin(off / r);
    const run = Math.sqrt(Math.max(0, r * r - off * off)) + Math.sqrt(Math.max(0, R * R - off * off));
    out.set(A.x + Math.sin(a) * run, 0, A.z + Math.cos(a) * run);
    if (!this.air) g.world?.resolve?.(out, P.radius, CONFIG.world.playerBound, false, 'hero');
    return out;
  }

  /** A flash cut's path is set (A, B, d, its line): he is there, the pass begins. */
  _cutStarts() {
    const A = this.A;
    this.hit = false;
    this.cloned = false;
    this.glow = 1;
    // a storm cut (DEFENSE.flurry.storm): he is in the cut already (no wind-up seen), its arrival a
    // thin flash, no more
    const st = this._storm(this.i);
    this._appear('cut', CUT_CLIPS[this.clipI++ % CUT_CLIPS.length], 1);
    this.fx.appear(A.x, A.y + CHEST, A.z, this.d.x, this.d.z, this.i, this.n, false, st);
    if (this.tempo) {
      // the tempo: seen wound up where he appears (`hang`; in the air too), then the pass
      const B = this._beat();
      this.hang = st > 0 ? 0 : B.hang / (B.hang + B.dash);
      this._phase(FP.DASH, (st > 0 ? B.dash : B.hang + B.dash) * this._pace(this.i));
      return;
    }
    this.hang = this.air || st > 0 ? 0 : G.hang / (G.hang + G.dash);
    this._phase(FP.DASH, (this.air ? F.cut.dash : st > 0 ? G.dash : G.hang + G.dash) * this._pace(this.i));
  }

  /** A flash cut lands: its damage, the freeze of the impact frame. */
  _cutHit() {
    const P = this.p, g = P.game, T = this.T, C = F.cut;
    this.hit = true;
    this._aim();
    const final = this.riposte && this.i >= this.cuts - 1; // a riposte's last cut is its last blow
    // (the counter's last cut is the counter blow: DEFENSE.flareCounter)
    const K = final && this.counter ? DEFENSE.flareCounter : null;
    // (the last blow's white hurt flash: x the burst level's `boss`, flurryBurst.js)
    const bf = final ? burstLook()?.boss ?? 1 : 1;
    const dealt = this._damage(K ? K.damage : C.damage, K ? K.posture : C.posture, !!K, (K ? 1 : 0.45) * bf, final ? 2 : 1, final ? { x: this.ox, z: this.oz } : null);
    const k = this.n > 1 ? this.i / (this.n - 1) : 0;
    // a storm cut (0..1: how deep into the storm) kicks the camera less, its flare and sparks thinner
    // (with the tempo the weight falls with the pace, no cliff: 1 at pace 1 to the storm's at `stormAt`)
    const st = final ? 0 : this._storm(this.i), w = this._weight(this.i);
    const cs = this.tempo ? lerp(S.cam, 1, w) : st > 0 ? S.cam : 1, fk = this.tempo ? lerp(S.fx, 1, w) : st > 0 ? S.fx : 1;
    const ck = (this.air ? 1 : G.kick) * cs, sk = (this.air ? 1 : G.shake) * cs; // a man is framed closer than the wyrm
    // (the chain: the bite is drawn where his blade passes the target, on the path he runs)
    const Q = this.chain ? this._onPath(this._q) : T;
    this.fx.cut(Q.x, Q.y, Q.z, this.d.x, this.d.z, this.i, this.n, st, st > 0 ? 1 : fk);
    if (!this.air) this.fx.ground(T.x, T.z, this.d.x, this.d.z, (0.6 + 0.6 * k) * fk);
    if (st > 0) this.fx.streak(this.A, this.p.position, CHEST, this.d.x, this.d.z);
    // weight: a kick along the cut, a punch in, the hero frozen on the contact, then a beat in which
    // the world runs and the target reels under it (a storm cut's are as short as its pace)
    g.shake?.((0.2 + 0.14 * k) * sk);
    g.punch?.((0.9 + 0.9 * k) * ck);
    this.freeze = final ? (this.tempo ? this._beat().stop : F.cut.stop * (0.75 + 0.25 * this._basePace(this.i))) * 1.8 : this._stop(this.i);
    this.reelT = this.freeze + fin(C.reel, 0) * (st > 0 && !final ? this._pace(this.i) : 1);
    const gap = this.lastHitT >= 0 ? this.clock - this.lastHitT : 0;
    this.lastHitT = this.clock;
    P.anim.kickCoat(0.5, P.anim.noise);
    if (dealt > 0) P._emit('player:hitDragon', { damage: dealt, part: this.air ? 'head' : 'body', point: { x: T.x, y: T.y, z: T.z }, heavy: final, crit: true, kind: 'flurry' });
    if (final) {
      this.fx.impact(T.x, T.y, T.z, this.d.x, this.d.z, K ? 1 : 0.7);
      P._hitstop(DEFENSE.plunge.impactStop * (K ? 1 : 0.7), 0.03);
      if (K) {
        g.shake?.(0.42 * sk);
        g.punch?.(2.6 * ck);
        P._emit('player:flareCounter', { attack: this.attack, damage: dealt, strikes: this.n });
      }
      this.burst(dealt, T);
      return;
    }
    this.total += dealt;
    // (extra fields: `gap` the real seconds since the blow before, `storm` 0 a shown cut, 1, 2, ...
    // how deep into the storm)
    P._emit('player:flurryHit', { n: this.i + 1, of: this.n, last: false, damage: dealt, gap: +gap.toFixed(3), storm: this._stormStep(this.i) });
  }

  /** The point of this pass (A → B, CHEST m over his root) nearest the target (→ out). */
  _onPath(out) {
    const A = this.A, B = this.B, T = this.T;
    const ex = B.x - A.x, ez = B.z - A.z, l2 = ex * ex + ez * ez;
    const f = l2 > 1e-6 ? clamp(((T.x - A.x) * ex + (T.z - A.z) * ez) / l2, 0, 1) : 0;
    return out.set(A.x + ex * f, A.y + (B.y - A.y) * f + CHEST, A.z + ez * f);
  }

  /** `damage` (final) into the target through its takeHit. Returns what was dealt. `reel`: how
   *  hard it throws him (1 a cut, 2 the last blow: a duelist staggers). `away`: { x, z } where the
   *  hero is when the blow is over (the last blow: a duelist stumbles away from there, not into him). */
  _damage(damage, posture, heavy, flash, reel = 1, away = null) {
    const att = this.att, T = this.T;
    if (!this._alive(att) || typeof att.takeHit !== 'function') return 0;
    try {
      const r = att.takeHit({
        damage, part: this.air ? 'head' : 'body', point: { x: T.x, y: T.y, z: T.z }, dir: { x: this.d.x, z: this.d.z },
        heavy, crit: true, exact: true, posture, flash, reel, away,
      });
      return Number.isFinite(r) ? r : 0;
    } catch (err) {
      console.error('[flurry] takeHit failed', err);
      return 0;
    }
  }

  // ------------------------------------------------------------------ the arts
  _beginArt() {
    const P = this.p, p = P.position, g = P.game, T = this.T, D = ARTS[this.art];
    if (!this._aim()) {
      this._bail();
      return;
    }
    if (D.kind === 'return') {
      this._return();
      return;
    }
    if (D.kind === 'plunge') {
      // the plunge takes it from here (its own state, its own slow-mo); the hanging cuts burst on
      // its impact (player.js _plungeImpact → burst)
      this.on = false;
      this.hidden = false;
      // (the chain: the plunge rises from the side of the head he is on, not the one he dodged on)
      this._from.ox = p.x;
      this._from.oz = p.z;
      if (!P._startPlunge(this.att, false, this.attack, this.tell, true, this.chain ? this._from : this)) this._bail();
      return;
    }
    const att = this.att, ap = att.position, A = this.A, B = this.B, X = this.X;
    const bound = CONFIG.world.playerBound;
    this.C0.copy(p);
    // (the chain: from where the last cut ended; an art alone, N = 1, starts as it always did)
    this._artChain = this.chain && this.cuts > 0;
    if (this._artChain) {
      if (!this._chainArt(D)) {
        this._bail();
        return;
      }
    } else if (this.air) {
      const pl = P.pl;
      pl.att = att;
      pl.exec = false;
      pl.hit = false;
      pl.dealt = 0;
      pl.ox = this.ox;
      pl.oz = this.oz;
      P._plungePoint(att, pl.pt);
      if (D.kind === 'iai') {
        // one level line across the head, from the side he dodged on (never along the neck)
        const a = this._offNeck(Math.atan2(this.ox - T.x, this.oz - T.z));
        const dx = Math.sin(a), dz = Math.cos(a), y = Math.max(MIN_Y, T.y - CHEST);
        A.set(T.x + dx * D.back, y, T.z + dz * D.back);
        B.set(T.x - dx * D.out, y, T.z - dz * D.out);
        this.d.x = -dx;
        this.d.z = -dz;
      } else {
        // from above the far side of the head down through it to a landing on the side he came from
        P._plungeDir(att, pl);
        pl.from.set(this.ox, 0, this.oz);
        P._plungeLanding(pl, pl.land);
        B.copy(pl.land);
        this.d.x = pl.dx;
        this.d.z = pl.dz;
        A.set(pl.pt.x - pl.dx * D.back, pl.pt.y + D.up - 0.6, pl.pt.z - pl.dz * D.back);
        X.set(T.x - pl.dx * 0.5, Math.max(MIN_Y, T.y - 0.25), T.z - pl.dz * 0.5);
      }
    } else {
      // on the ground: in at his front, out behind his back
      let fy = fin(att.yaw, NaN);
      if (!Number.isFinite(fy)) fy = Math.atan2(this.ox - ap.x, this.oz - ap.z);
      const fx = Math.sin(fy), fz = Math.cos(fy);
      const behind = fin(att.ghostepBehind, 1.5);
      // (the iai and the split pass his side, as the cuts do: never through his body)
      const sd = D.kind === 'vault' ? 0 : (P.anim.noise() < 0.5 ? -1 : 1) * G.side;
      const ia = D.kind === 'iai' ? sd : 0;
      A.set(ap.x + fx * D.back + fz * ia, 0, ap.z + fz * D.back - fx * ia);
      B.set(ap.x - fx * behind + fz * sd, 0, ap.z - fz * behind - fx * sd);
      g.world?.resolve?.(A, P.radius, bound, false, 'hero');
      g.world?.resolve?.(B, P.radius, bound, false, 'hero');
      if (!Number.isFinite(A.x + A.z + B.x + B.z)) {
        this._bail();
        return;
      }
      A.y = D.kind === 'split' ? D.up : 0;
      B.y = 0;
      X.set(ap.x + fx * 0.5, 0.5, ap.z + fz * 0.5);
      this.d.x = -fx;
      this.d.z = -fz;
    }
    // (the chain: he winds up where the last cut left him, and the coil carries him to A: the split
    // rises to its height, the vault steps in; the iai's A is where he is)
    if (this._artChain) p.copy(this.C0);
    else p.copy(A);
    P.yaw = this.yaw0 = Math.atan2(this.d.x, this.d.z);
    this.hit = false;
    this.glinted = false;
    this.glow = 0;
    this._swN = 0;
    this._appear(D.kind === 'iai' ? 'coil' : D.kind === 'split' ? 'raise' : 'crouch', D.kind === 'iai' ? 'drawCut' : D.kind === 'split' ? 'slam' : 'risingSlash', 1);
    this.fx.appear(p.x, p.y + CHEST, p.z, this.d.x, this.d.z, this.n - 1, this.n, true);
    this._phase(FP.COIL, D.coil);
    P._emit('player:flurryArt', { art: this.art, air: this.air, dur: D.coil });
  }

  /**
   * The chain: the art from where the last cut ended (this.C0), on through the target, in its own
   * shape → A (where the strike starts), B (where it ends), X (the split's contact), d. On the ground
   * he ends past the foe (`ghostepBehind` beyond him along the line); round the head the iai runs from
   * here through the middle, the split rises above this side and lands on the far one.
   */
  _chainArt(D) {
    const P = this.p, g = P.game, T = this.T, att = this.att, ap = att.position, A = this.A, B = this.B, X = this.X, C0 = this.C0;
    const bound = CONFIG.world.playerBound;
    let ux = T.x - C0.x, uz = T.z - C0.z;
    const r = Math.hypot(ux, uz);
    if (r > 0.3) {
      ux /= r;
      uz /= r;
    } else {
      ux = this.d.x;
      uz = this.d.z;
    }
    if (this.air) {
      const pl = P.pl;
      pl.att = att;
      pl.exec = false;
      pl.hit = false;
      pl.dealt = 0;
      pl.ox = this.ox;
      pl.oz = this.oz;
      P._plungePoint(att, pl.pt);
      const cy = T.y - CHEST;
      if (D.kind === 'iai') {
        // one straight line from where he is through the head's middle; if that runs along the neck
        // (into the body) the coil carries him round the head, as far out, to where it does not
        let a = Math.atan2(ux, uz);
        A.copy(C0);
        A.y = Math.max(MIN_Y, C0.y);
        if (this._neckGap(a) < 0.55) {
          a = this._offNeck(a);
          const rr = Math.max(1, r);
          A.x = T.x - Math.sin(a) * rr;
          A.z = T.z - Math.cos(a) * rr;
        }
        const dx = Math.sin(a), dz = Math.cos(a), run = Math.max(0, (T.x - A.x) * dx + (T.z - A.z) * dz) + D.out;
        B.set(A.x + dx * run, Math.max(MIN_Y, 2 * cy - A.y), A.z + dz * run);
        this.d.x = dx;
        this.d.z = dz;
      } else {
        // the far side of the head is where he lands: it rises above this side, falls through it
        pl.ox = T.x + ux * 3;
        pl.oz = T.z + uz * 3;
        P._plungeDir(att, pl);
        pl.from.set(pl.ox, 0, pl.oz);
        P._plungeLanding(pl, pl.land);
        B.copy(pl.land);
        this.d.x = pl.dx;
        this.d.z = pl.dz;
        A.set(pl.pt.x - pl.dx * D.back, pl.pt.y + D.up - 0.6, pl.pt.z - pl.dz * D.back);
        X.set(T.x - pl.dx * 0.5, Math.max(MIN_Y, T.y - 0.25), T.z - pl.dz * 0.5);
      }
    } else {
      const behind = fin(att.ghostepBehind, 1.5);
      // (the iai and the split pass his side, as the cuts do: the side nearer the way he faces now)
      let sd = 0;
      if (D.kind !== 'vault') {
        const turn = this.d.x * uz - this.d.z * ux; // which way he turns to face the target
        sd = (turn >= 0 ? 1 : -1) * G.side;
      }
      const px = uz, pz = -ux; // across the line, in the ground plane
      if (D.kind === 'iai') A.set(C0.x, 0, C0.z);
      else A.set(T.x - ux * D.back, 0, T.z - uz * D.back);
      B.set(T.x + ux * behind + px * sd, 0, T.z + uz * behind + pz * sd);
      if (D.kind === 'iai') {
        // (from where he stands past his side: the line through the side point)
        const sx = T.x + px * sd - A.x, sz = T.z + pz * sd - A.z, sl = Math.hypot(sx, sz);
        if (sl > 0.3) B.set(A.x + (sx / sl) * (sl + behind), 0, A.z + (sz / sl) * (sl + behind));
      }
      g.world?.resolve?.(A, P.radius, bound, false, 'hero');
      g.world?.resolve?.(B, P.radius, bound, false, 'hero');
      if (!Number.isFinite(A.x + A.z + B.x + B.z)) return false;
      A.y = D.kind === 'split' ? D.up : 0;
      B.y = 0;
      X.set(T.x - ux * 0.5, 0.5, T.z - uz * 0.5);
      const ex = B.x - A.x, ez = B.z - A.z, el = Math.hypot(ex, ez);
      this.d.x = el > 1e-3 ? ex / el : ux;
      this.d.z = el > 1e-3 ? ez / el : uz;
    }
    return Number.isFinite(A.x + A.y + A.z + B.x + B.y + B.z + X.x + X.y + X.z);
  }

  /** The coil: he hangs in the wound-up pose while the blade gathers its light. */
  _tickCoil(u, rdt) {
    const P = this.p, D = ARTS[this.art];
    if (this._artChain) {
      // (the chain: from where the last cut left him to where the strike starts, slowing into it)
      P.position.lerpVectors(this.C0, this.A, 1 - (1 - u) * (1 - u));
      this.anim.air = P.position.y > 0.05;
    }
    this.glow = u;
    this.anim.k = u;
    P.getChestPos(this._v, true);
    this.fx.gather(rdt, this._v.x, this._v.y, this._v.z, u);
    if (u >= 0.7 && !this.glinted) {
      this.glinted = true;
      P._bladePoint(0.9, this._v);
      this.fx.glint(this._v.x, this._v.y, this._v.z);
    }
    if (u < 1) return;
    this.glow = 1;
    if (this._artChain) P.position.copy(this.A);
    if (this.chain) this._sample();
    if (D.kind === 'iai') this._line(this.A, this.B, CHEST, true);
    // (the wyrm's last blow is a plunge to everything that listens: the dive's rush, the stats)
    if (this.air) P._emit('player:plunge', { execution: false });
    this.anim.pose = 'cut';
    this.anim.u = 1;
    P.anim.play('flurry', 0.02);
    this._phase(FP.STRIKE, D.strike);
  }

  /** Hang a cut from a → b (root points; drawn `up` m above them). */
  _line(a, b, up, last = false) {
    if (this.nLines >= this.lines.length) return null;
    const L = this.lines[this.nLines++];
    L.ax = a.x;
    L.ay = a.y + up;
    L.az = a.z;
    L.bx = b.x;
    L.by = b.y + up;
    L.bz = b.z;
    L.k = 0;
    L.last = last;
    L.hold = false;
    return L;
  }

  /** The chain: his blade's point now onto the art's sampled path (the split's / vault's crescent). */
  _sample() {
    if (this._swN >= this._sw.length / 3) return;
    const v = this.p._bladePoint(1, this._v), k = this._swN * 3;
    if (!Number.isFinite(v.x + v.y + v.z)) return;
    this._sw[k] = v.x;
    this._sw[k + 1] = v.y;
    this._sw[k + 2] = v.z;
    this._swN++;
  }

  _tickStrike(u) {
    const P = this.p, p = P.position, D = ARTS[this.art], A = this.A, B = this.B, X = this.X, an = this.anim;
    if (this.chain && !this.hit && D.kind !== 'iai') this._sample();
    if (D.kind === 'iai') {
      // (on the ground he slows into the finish, so the eye lands on it)
      const e = this.air ? u : 1 - (1 - u) * (1 - u);
      p.lerpVectors(A, B, e);
      an.u = 1 + u;
      const L = this.lines[this.nLines - 1];
      if (L) L.k = e;
      if (u >= 1) {
        // across, his back to it: the finish held while the cut hangs in the air unanswered
        if (this.chain) {
          // (the chain: the flash on his path where it passes the target)
          const Q = this._onPath(this._q);
          this.fx.pass(Q.x, Q.y, Q.z, this.d.x, this.d.z);
        } else this.fx.pass(this.T.x, this.T.y, this.T.z, this.d.x, this.d.z);
        P.game.shake?.(0.12);
        this._phase(FP.AFTER, D.hold);
      }
      return;
    }
    if (D.kind === 'split') {
      // falling faster and faster onto it, then on through to the ground
      if (u < SPLIT_AT) {
        const k = u / SPLIT_AT;
        p.lerpVectors(A, X, k * k);
      } else p.lerpVectors(X, B, (u - SPLIT_AT) / (1 - SPLIT_AT));
      an.u = 1 + u;
      an.air = p.y > 0.3;
      if (!this.hit && u >= SPLIT_AT) {
        p.copy(X);
        this._artHit(0.09);
        return;
      }
      if (u >= 1) this._touchdown();
      return;
    }
    // the vault: the rising cut where he stands, then up and over the foe to his back
    const q = clamp((u - 0.12) / 0.88, 0, 1), s = q * q * (3 - 2 * q);
    p.x = A.x + (B.x - A.x) * s;
    p.z = A.z + (B.z - A.z) * s;
    p.y = D.up * 4 * q * (1 - q);
    if (u < VAULT_FLIP) {
      an.pose = 'cut';
      an.u = 1 + u / VAULT_FLIP;
    } else {
      if (an.pose !== 'flip') {
        an.pose = 'flip';
        P.anim.play('flurry', 0.05);
      }
      an.u = (u - VAULT_FLIP) / (1 - VAULT_FLIP);
      // a half turn through the somersault: he comes down facing the foe's back
      P.yaw = this.yaw0 + Math.PI * smoothstep(0.1, 0.9, an.u);
    }
    an.air = p.y > 0.2;
    if (!this.hit && u >= VAULT_HIT) {
      this._artHit(0.08);
      return;
    }
    if (u >= 1) this._touchdown();
  }

  /** The iai's held finish: the cut lands as it ends. */
  _tickAfter(u) {
    this.anim.u = 2 + 0.3 * u;
    if (u < 1) return;
    if (!this.hit) {
      this._artHit(0.1);
      return;
    }
    if (this.air) this._dropOff();
    else this._settle();
  }

  /** The last blow lands: the wyrm's through onPlunge, a foe's through takeHit; the hanging cuts
   *  burst. `stop`: s (real) he holds the contact pose. */
  _artHit(stop) {
    const P = this.p, g = P.game, T = this.T, att = this.att, PL = DEFENSE.plunge;
    this.hit = true;
    this._aim();
    let dealt = 0;
    if (this.air) {
      if (P._plungeable(att)) {
        try {
          const r = att.onPlunge({ damage: PL.damage, posture: PL.posture, point: { x: T.x, y: T.y + 0.3, z: T.z }, execution: false });
          dealt = Number.isFinite(r) ? r : PL.damage;
        } catch (err) {
          console.error('[flurry] onPlunge failed', err);
        }
      }
      if (dealt > 0) P._emit('player:hitDragon', { damage: dealt, part: 'head', point: { x: T.x, y: T.y, z: T.z }, heavy: true, crit: false, kind: 'plunge' });
      P._emit('player:plungeHit', { damage: dealt, execution: false });
    } else {
      dealt = this._damage(F.last.damage, F.last.posture, true, burstLook()?.boss ?? 1, 2, { x: this.B.x, z: this.B.z });
      if (dealt > 0) P._emit('player:hitDragon', { damage: dealt, part: 'body', point: { x: T.x, y: T.y, z: T.z }, heavy: true, crit: true, kind: 'flurry' });
    }
    // the weight of the last blow: he holds the contact half as long again, the frame freezes,
    // the camera is thrown in and shaken hard, the ground gives under a foe who stands on it
    this.freeze = stop * 1.5;
    this.reelT = 0;
    P._hitstop(PL.impactStop * 1.25, 0.02);
    g.shake?.(Math.min(1, PL.impactShake + 0.06 * this.n) * (this.air ? 1 : G.shake));
    g.punch?.((2.2 + 0.25 * this.n) * (this.air ? 1 : G.kick));
    g.world?.gust?.(T.x, T.z, 1.5, 8);
    P.anim.kickCoat(1.1, P.anim.noise);
    // (the chain: the split's / vault's crescent is the path his blade swept, sampled to this frame)
    if (this.chain) this._sample();
    this.fx.artHit(T.x, T.y, T.z, this.d.x, this.d.z, ARTS[this.art].kind, this.chain ? this._sw : null, this._swN);
    this.fx.impact(T.x, T.y, T.z, this.d.x, this.d.z, 1);
    if (!this.air) {
      this.fx.ground(T.x, T.z, this.d.x, this.d.z, 1.6);
      // (the chain: white-steel letter dust, not the slam's big 'A' shards)
      if (this.chain) this.fx.dust(T.x + this.d.x * 0.4, 0, T.z + this.d.z * 0.4, this.d.x, this.d.z);
      else P.fx.slamShards(T.x + this.d.x * 0.4, T.z + this.d.z * 0.4, true);
    }
    this.burst(dealt, T);
  }

  /**
   * The last blow has landed (`dealt` its damage, at `at`): the hanging cuts burst, the count is
   * called. The plunge calls this from its impact when a flurry led into it.
   */
  burst(dealt, at) {
    const P = this.p, g = P.game;
    if (!this.pending) return;
    this.pending = false;
    this.total += fin(dealt);
    const n = this.n;
    P._emit('player:flurryHit', { n, of: n, last: true, damage: fin(dealt) });
    if (this.nLines > 0) {
      this.fx.burst(this.lines, this.nLines, fin(at?.x, P.position.x), fin(at?.y, 1.2), fin(at?.z, P.position.z));
      g.shake?.(Math.min(0.5, 0.12 + 0.05 * this.nLines) * (this.air ? 1 : G.shake));
      g.punch?.(Math.min(4, 1.2 + 0.45 * this.nLines) * (this.air ? 1 : G.kick));
    }
    this.nLines = 0;
    P._emit('player:flurryEnd', { strikes: n, damage: Math.round(this.total), art: this.art, label: ARTS[this.art]?.label ?? '' });
  }

  /** A split or a vault comes down: on the ground past the target. */
  _touchdown() {
    const P = this.p, p = P.position;
    p.copy(this.B);
    p.y = 0;
    if (this.air) {
      // the plunge's own landing: the crouch, the slide, the crit window
      this.on = false;
      P._enter('plunge', 'plunge', 0.03);
      if (this.chain) this.fx.dust(p.x + this.d.x * 0.7, 0, p.z + this.d.z * 0.7, this.d.x, this.d.z, 0.6);
      else P.fx.slamShards(p.x + this.d.x * 0.7, p.z + this.d.z * 0.7, true);
      P._plungeLand();
      return;
    }
    P.fx.plungeLand(p.x, p.z, this.d.x, this.d.z);
    P.game.shake?.(0.2);
    // (the living world's steps answer the touchdown: world/life/steps.js)
    const surface = P.game.world?.life?.steps?.footfall?.(p.x, p.z, { heavy: true, sprint: true, side: 0, vx: this.d.x, vz: this.d.z });
    P._emit('player:footstep', surface ? { x: p.x, z: p.z, sprint: true, surface } : { x: p.x, z: p.z, sprint: true });
    this._settle();
  }

  /** A riposte is over: he is back where he parried, facing the foe, free at once. */
  _return() {
    const P = this.p, p = P.position, g = P.game;
    if (this.pending) this.burst(0, this.T);
    p.set(fin(this.ox, p.x), 0, fin(this.oz, p.z));
    g.world?.resolve?.(p, P.radius, CONFIG.world.playerBound, false, 'hero');
    this.fx.pull = 0;
    this.fx.appear(p.x, CHEST, p.z, 0, 0, 0, 1, true);
    P.anim.teleported();
    this._settle(false);
  }

  /** On the ground behind the foe: the Ghostep's reappear, the crit window open (`crit`). */
  _settle(crit = true) {
    const P = this.p, p = P.position, att = this.att, ap = att?.position;
    this.on = false;
    this.hidden = false;
    p.y = 0;
    P._collide();
    if (!Number.isFinite(p.x + p.z)) p.set(this.ox, 0, this.oz);
    const has = !!ap && Number.isFinite(ap.x + ap.z);
    if (has && (ap.x - p.x) ** 2 + (ap.z - p.z) ** 2 > 1e-4) P.yaw = Math.atan2(ap.x - p.x, ap.z - p.z);
    P.iframeT = this.tune.ghostepIframes;
    if (crit) P.critTimer = DEFENSE.ghostep.critWindow;
    P.assist.target = has && this._alive(att) ? att : null;
    P.assist.t = P.assist.target ? this.tune.ghostepAssist : 0;
    P.sweep.valid = false;
    P._enter('ghostep', 'ghostep', 0.08);
    P.anim.kickCoat(0.8, P.anim.noise);
  }

  /** In the air beside the head with the blow struck: down through the plunge's flip and landing,
   *  on the side he is on. */
  _dropOff() {
    const P = this.p, p = P.position, pl = P.pl;
    this.on = false;
    this.hidden = false;
    pl.att = this.att;
    pl.exec = false;
    pl.hit = false;
    pl.ox = this.ox;
    pl.oz = this.oz;
    if (!P._plungePoint(this.att, pl.pt)) pl.pt.set(this.T.x, this.T.y + 0.55, this.T.z);
    let dx = p.x - pl.pt.x, dz = p.z - pl.pt.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.3) {
      dx /= l;
      dz /= l;
    } else {
      dx = -this.d.x;
      dz = -this.d.z;
    }
    pl.dx = dx;
    pl.dz = dz;
    P._enter('plunge', 'plunge', 0.05);
    // (he lands beyond where he hangs: the flip carries him on, away from the head)
    P._plungeFlip(Math.min(DEFENSE.plunge.landMax - 1.5, l + 1.2));
  }

  /** The target is gone (it died under the cuts, a reset): end here. What hangs bursts where it is. */
  _bail() {
    const P = this.p, p = P.position;
    this.hidden = false;
    if (this.pending) this.burst(0, this.T);
    if (P.state !== 'flurry') {
      this.on = false;
      return;
    }
    if (p.y > 0.3) this._dropOff();
    else this._settle();
  }

  // ------------------------------------------------------------------ what the player draws / frames
  /** Every frame (player.js _updateFx, fx time): the hanging cuts; through a pass, the wake behind him. */
  draw(dt) {
    const g = this.p.game;
    if (this._cloneAt) {
      // a storm cut's speed clone: the pose he is drawn in on the contact this frame, held there
      // while he is already at the next (his matrices were set this frame: player.js update)
      this._cloneAt = false;
      if (this.on && !this.hidden) this.fx.clone(this.p._ghostSegs, this.p._sampleGhost(), true);
    }
    if (this.nLines > 0) this.fx.lines(this.lines, this.nLines, g);
    this.fx.steel(g, this.nLines > 0 ? this.lines : null, this.nLines);
    if (!this.on || this.hidden || !(dt > 0)) {
      this._w.ok = false;
      return;
    }
    const p = this.p.position, w = this._w;
    if ((this.ph === FP.DASH || this.ph === FP.STRIKE) && w.ok) {
      // (along the way he really moved this frame: a split falls, a vault climbs)
      const dx = p.x - w.x, dy = p.y - w.y, dz = p.z - w.z, l = Math.hypot(dx, dy, dz);
      if (l > 0.05 && l < 6) this.fx.wake(p.x, p.y + CHEST * 0.9, p.z, dx / l, dy / l, dz / l);
    }
    w.x = p.x;
    w.y = p.y;
    w.z = p.z;
    w.ok = this.ph === FP.DASH || this.ph === FP.STRIKE;
  }

  /** Keep the hero and the target on screen (core/cameraRig keep). */
  camera() {
    const P = this.p, rig = P.game.cameraRig, p = P.position, T = this.T;
    if (typeof rig?.keep !== 'function') return;
    if (this.on && this.i < this.cuts && this._stormStep(this.i) > 0) {
      // the storm: he is round the target every few frames, on every side. The camera holds the
      // target and the ring his cuts run on (as wide as the shown cuts already made it), and does
      // not chase him from side to side
      rig.keep(T.x, T.y, T.z, this.air ? 2.4 : 1.6, true);
      rig.keep(T.x, this.air ? T.y : 1.1, T.z, (this.air ? F.reach.air : G.reach) * 0.9, false);
      return;
    }
    if (!this.hidden) rig.keep(p.x, p.y + 1.1, p.z, 1.6, true);
    rig.keep(T.x, T.y, T.z, this.air ? 2.4 : 1.6, this.hidden);
  }
}
