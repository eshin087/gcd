import { perPhase } from './realise.js';
import { answerOf, GUARD, DODGE } from './director.js';

// The cue ledger (the second pass; brain.js owns one per duelist): the impacts the duelist knows are
// coming and what each one asks of the hero (GUARD: a block or a parry answers it; DODGE: only a
// roll). It is fed from four places:
//   (a) the running move's beats, read on demand (exact: the brain owns their clock)
//   (b) the cues that were given (combat:flash, any source: the impact is flashLead away), and the
//       world's warnings (combat:tell from 'world' or a hazard: a felled piece, a mark)
//   (c) a predictor, every frame, over what flies or waits in the effect pools (read only): the
//       crescents / pushes / fissures (fx.crescents), the Lord's thrown blade and torn stones
//       (fx.shots), his marks and the Dark Star (fx.strikes), the Starless Sky still to fall
//       (d._storm), the courtyard's kicked lantern and toll rings and the crater's landing marks
//       (d.terrain)
//   (d) what other code tells it: expect(timeFromNow, tell, source) → a handle (brain.expect)
// It answers one question: would an impact at a time, needing an answer, land within `sep` s of one
// needing the other answer (and by how much must it wait so it does not)?
// Everything lives in fixed pools: nothing is allocated per frame.

const RING = 32; // given cues kept
const PRED = 40; // predicted impacts per frame
const EXP = 24; // expect() handles alive at once
const WORLD_LEAD = 0.3; // (world/destructibles.js FLASH_LEAD: a felled piece's cue)
const GLAIVE_WAIT = 0.32; // (starlessLord/fx.js updateShots: the thrown blade hangs where it turns)

/** A beat that throws something straight at the hero from his hand (a release: crescents, the push,
 *  fissures; the thrown blade): it lands a flight after the beat's impact. */
export const throwsAt = (b) => !!(b.def.release || b.def.cast?.kind === 'glaive');

/** One known impact. `fixed`: it cannot be moved (a cue already given, a thing in flight); a
 *  movable one (a called strike before its cue) yields instead. */
const entry = () => ({ t: -99, ans: 0, attack: '', fixed: true, ref: null });

/** A handle on an expected impact (brain.expect). */
class Expect {
  constructor(L, e) {
    this._L = L;
    this._e = e;
    this._gen = e.gen;
  }
  /** Still counted (not cancelled, not past). */
  get alive() {
    return this._e.gen === this._gen && this._e.alive;
  }
  /** Seconds until its impact (NaN once it is gone). */
  get left() {
    return this.alive ? this._e.t - this._L.now : NaN;
  }
  /** It lands `timeFromNow` s from now instead. */
  retime(timeFromNow) {
    if (!this.alive || !Number.isFinite(timeFromNow)) return this;
    this._e.t = this._L.now + Math.max(0, timeFromNow);
    return this;
  }
  /** It will not land (it fizzled, was parried, the move was cut short). */
  cancel() {
    if (this.alive) this._e.alive = false;
    return this;
  }
}

export class CueLedger {
  constructor(brain) {
    this.brain = brain;
    this.d = brain.d;
    this.now = 0;
    this.ring = Array.from({ length: RING }, entry);
    this.ringI = 0;
    this.pred = Array.from({ length: PRED }, entry);
    this.nPred = 0;
    this.exp = Array.from({ length: EXP }, () => ({ ...entry(), alive: false, gen: 0, src: '' }));
    /** the attack of the impact the last conflict() found (the guard's diary names the pair) */
    this.hit = '';
    const ev = this.d.game?.events;
    if (ev?.on) {
      ev.on('combat:flash', (e) => this._onFlash(e));
      ev.on('combat:tell', (e) => this._onTell(e));
    }
  }

  reset() {
    for (const e of this.ring) e.t = -99;
    for (const e of this.exp) e.alive = false;
    this.nPred = 0;
  }

  // ---------------------------------------------------------------- (b) cues given
  _push(t, tell, attack) {
    const e = this.ring[this.ringI];
    this.ringI = (this.ringI + 1) % RING;
    e.t = t;
    e.ans = answerOf(tell);
    e.attack = attack ?? '';
    e.fixed = true;
    e.ref = null;
  }

  _onFlash(e) {
    if (!e || (e.source !== 'dragon' && e.source !== 'world')) return;
    const lead = e.source === 'world' ? WORLD_LEAD : perPhase(this.d.T.flashLead, this.d.phase);
    this._push(this.d.time + lead, e.tell, e.attack);
  }

  _onTell(e) {
    // (a blade's own tell is the brain's, read from the move itself; a thrown thing's tell gives its
    // release, not its arrival: only the world's warnings and the hazards' are taken here)
    if (!e || !Number.isFinite(e.impactIn) || !(e.source === 'world' || (e.source === 'dragon' && e.hazard))) return;
    this._push(this.d.time + e.impactIn, e.tell, e.attack);
    // (the world's warning cannot wait: what of his is in flight and would land too near it gives way)
    if (e.source === 'world') this.brain._worldCue?.(this.d.time + e.impactIn, answerOf(e.tell));
  }

  // ---------------------------------------------------------------- (d) expect
  /**
   * A thing that will land on the hero `timeFromNow` s from now, needing the answer its `tell` asks
   * (normal / blue: a guard; red / black: a dodge). `source`: its name (an attack's, for the meter).
   * Returns a handle: `retime(timeFromNow)`, `cancel()`, `alive`, `left`. It expires by itself 0.3 s
   * after its impact. null when the pool is full (then it is not counted: keep fewer alive).
   */
  expect(timeFromNow, tell, source = '') {
    if (!Number.isFinite(timeFromNow)) return null;
    const e = this.exp.find((x) => !x.alive);
    if (!e) return null;
    e.alive = true;
    e.gen++;
    e.t = this.now + Math.max(0, timeFromNow);
    e.ans = answerOf(tell);
    e.attack = source;
    e.src = source;
    e.fixed = true;
    e.ref = null;
    return new Expect(this, e);
  }

  // ---------------------------------------------------------------- (c) the predictor
  _pred(t, tell, attack, fixed, ref = null) {
    if (this.nPred >= PRED || !Number.isFinite(t)) return;
    const e = this.pred[this.nPred++];
    e.t = t;
    e.ans = typeof tell === 'number' ? tell : answerOf(tell);
    e.attack = attack ?? '';
    e.fixed = fixed;
    e.ref = ref;
  }

  /** Every frame (brain.update): the clock, and what flies or waits right now. */
  update() {
    const d = this.d, now = (this.now = d.time);
    for (const e of this.exp) if (e.alive && e.t < now - 0.3) e.alive = false;
    this.nPred = 0;
    const pl = d.game?.player, p = pl?.position;
    if (!p || pl.alive === false) return;
    const pr = pl.radius ?? 0.45;
    const fx = d.fx;
    // crescents, the push, fissures: straight lines at the hero, not yet cued
    const C = d.T.crescent;
    if (fx?.crescents && C) {
      for (const c of fx.crescents) {
        if (!c.alive || c.done || c.flashed >= 0) continue;
        const speed = c.speed ?? C.speed, half = c.half ?? 1.0, reach = (c.radius ?? C.radius) + pr;
        const rx = p.x - c.x, rz = p.z - c.z, along = rx * c.dx + rz * c.dz, across = Math.abs(-rx * c.dz + rz * c.dx);
        if (across < half && along > reach && speed > 0) this._pred(now + (along - reach) / speed, c.tell, c.attack, true);
      }
    }
    // the Lord's thrown blade and torn stones
    if (fx?.shots) {
      for (const s of fx.shots) {
        if (!s.alive || s.done || s.flashed >= 0) continue;
        const reach = (s.radius ?? 0.8) + pr;
        if (s.phase === 'hang') {
          const sp = s.speed || 1, dist = Math.hypot(p.x - s.x, p.z - s.z);
          this._pred(now + Math.max(0, s.delay - s.age) + Math.max(0, dist - reach) / sp, s.tell, s.attack, true);
          continue;
        }
        const speed = s.phase === 'back' ? s.back : s.speed;
        const rx = p.x - s.x, rz = p.z - s.z, along = rx * s.dx + rz * s.dz, across = Math.abs(-rx * s.dz + rz * s.dx);
        if (across < reach + 0.5 && along > reach && speed > 0) this._pred(now + Math.max(0, s.wait ?? 0) + (along - reach) / speed, s.tell, s.attack, true);
        // the thrown blade still going out: its way home, from where it will turn to his hand, may pass
        // the hero too (seen from the throw on, so a strike called now leaves it room)
        if (s.kind === 'glaive' && s.phase === 'fly' && s.speed > 0) {
          const rem = Math.max(0, (s.range ?? 12) - Math.hypot(s.x - s.ox, s.z - s.oz));
          const tx = s.x + s.dx * rem, tz = s.z + s.dz * rem, H = d._hilt ?? d.position;
          const hl = Math.hypot(H.x - tx, H.z - tz) || 1, ux = (H.x - tx) / hl, uz = (H.z - tz) / hl;
          const qx = p.x - tx, qz = p.z - tz, al = qx * ux + qz * uz, ac = Math.abs(-qx * uz + qz * ux);
          if (ac < reach + 0.5 && al > reach && al < hl) this._pred(now + rem / s.speed + GLAIVE_WAIT + (al - reach) / Math.max(1, s.back || s.speed), s.tell, s.attack, true);
        }
      }
    }
    // marked ground: called lightning, the Dark Star (red; movable until its cue)
    // (one whose cue is due within a frame or two is committed: brain._fairStrikes has decided it)
    const lead = perPhase(d.T.flashLead, d.phase);
    if (fx?.strikes) for (const s of fx.strikes) if (s.alive && !s.flashed) this._pred(now + (s.at - s.t), DODGE, s.attack, s.at - s.t <= lead + 0.04, s);
    // the Starless Sky still to fall: one mark every gap, each `warn` s from its call
    const St = d._storm, ST = d.T.storm;
    if (St?.left > 0 && ST) for (let k = 0; k < St.left && k < 8; k++) this._pred(now + Math.max(0, St.t) + k * ST.gap + ST.warn, DODGE, 'storm', false);
    const Tr = d.terrain;
    if (Tr) {
      // the courtyard: the kicked piece in the air, the rings of sound
      const S = Tr.shot;
      if (S?.live && !S.flashed && S.piece) this._pred(now + Math.max(0, S.piece.T - S.piece.t), S.tell, S.attack, true);
      const K = d.T.terrain?.toll;
      if (Tr.rings && K) {
        for (const R of Tr.rings) {
          if (!R.alive || R.done || R.flashed >= 0) continue;
          const gap = Math.hypot(p.x - R.x, p.z - R.z) - R.r, reach = K.width + pr;
          if (gap > reach) this._pred(now + (gap - reach) / K.speed, R.tell, R.attack, true);
        }
      }
      // the crater: where a thrown piece lands (red); the pieces of a Glass Rain still held, one
      // thrown every `gap` s (each lands about a flight later)
      if (Tr.marks) for (const m of Tr.marks) if (m.alive && !m.flashed) this._pred(now + Math.max(0, m.at - m.t), DODGE, m.attack, true);
      const TT = d.T.terrain;
      if (Tr.held && Tr.cast && TT?.flight) {
        let k = 0;
        const fl = (TT.flight[0] + TT.flight[1]) / 2;
        for (const h of Tr.held) if (h.piece) this._pred(now + Math.max(0, Tr.gapT ?? 0) + k++ * (TT.gap ?? 0.55) + fl, DODGE, Tr.hit?.attack ?? 'terrain', true);
      }
    }
  }

  // ---------------------------------------------------------------- queries
  /**
   * Is there a known impact needing the OTHER answer than `ans` within `sep` s of absolute time
   * `at`? o: { fixedOnly (skip what can still move), skipAct (skip the running move's own beats),
   * self (an entry's ref to skip) }.
   */
  conflict(at, ans, sep, fixedOnly = false, skipAct = false, self = null) {
    const now = this.now;
    for (const e of this.ring) if (e.t > now - 0.05 && e.ans !== ans && Math.abs(e.t - at) < sep) return this._hit(e.attack);
    // (a thing in flight not cued yet: its arrival moves with the hero, a roll included: it is given
    // `pad` s more room, pressure.guard.pad)
    const pad = this.brain.P?.guard?.pad ?? 0;
    for (let i = 0; i < this.nPred; i++) {
      const e = this.pred[i];
      if (e.ans === ans || (fixedOnly && !e.fixed) || (self && e.ref === self)) continue;
      if (Math.abs(e.t - at) < sep + (e.ref ? 0 : pad)) return this._hit(e.attack);
    }
    for (const e of this.exp) if (e.alive && e.ans !== ans && Math.abs(e.t - at) < sep) return this._hit(e.attack);
    if (!skipAct) {
      // the running move's blows: those cued already, and those that cannot wait (`fixed`); one not
      // cued yet will wait for what is set now when its own cue comes (brain._holdBeat)
      const a = this.brain.act;
      if (a && this.d.mode === 'act') {
        for (const b of a.beats) {
          if (b.feint || b.done || b.impact < a.t || (b.def.cast && !throwsAt(b))) continue;
          if (throwsAt(b)) {
            // what it throws: from its release to its estimated arrival (pad more room)
            if (answerOf(b.def.tell) === ans) continue;
            const t0 = now + (b.impact - a.t), t1 = t0 + this.travel(b);
            if (at > t0 - sep - pad && at < t1 + sep + pad) return this._hit(a.name);
            continue;
          }
          if (!(b.flashed || b.def.fixed || a.def.transition)) continue;
          if (answerOf(b.def.tell) !== ans && Math.abs(now + (b.impact - a.t) - at) < sep) return this._hit(a.name);
        }
      }
    }
    return false;
  }

  _hit(attack) {
    this.hit = attack || '?';
    return true;
  }

  /** How long what a release beat throws takes to reach the hero (s; the crescent, the push, the
   *  fissures: their own speed). */
  travel(b) {
    const d = this.d, R = b.def.release ?? {}, p = d.game?.player?.position;
    if (!p) return 0;
    const T = d.T, K = b.def.cast?.kind === 'glaive' ? T.glaive : R.style === 'push' ? T.push : R.style === 'rift' ? T.rift : T.crescent;
    const speed = R.speed ?? K?.speed ?? 14;
    const dist = Math.hypot(p.x - d.position.x, p.z - d.position.z) - (R.from ?? 1) - (K?.radius ?? 0.7) - 0.45;
    return Math.max(0, dist) / Math.max(1, speed);
  }

  /** The least wait (s, a step of 0.02) after which an impact at `at` clears every conflict, up to
   *  `max`; 0 when it is clear now, -1 when no wait up to `max` clears it. */
  clearShift(at, ans, sep, max, fixedOnly = false, skipAct = false, self = null) {
    if (!this.conflict(at, ans, sep, fixedOnly, skipAct, self)) return 0;
    for (let s = 0.02; s <= max + 1e-6; s += 0.02) if (!this.conflict(at + s, ans, sep, fixedOnly, skipAct, self)) return s;
    return -1;
  }

  /** Something needing `ans` lands within `horizon` s (cued, predicted or expected; the running
   *  move's own beats aside). */
  pending(ans, horizon) {
    const now = this.now, to = now + horizon;
    for (const e of this.ring) if (e.ans === ans && e.t > now && e.t < to) return true;
    for (let i = 0; i < this.nPred; i++) {
      const e = this.pred[i];
      if (e.ans === ans && e.t > now - 0.05 && e.t < to) return true;
    }
    for (const e of this.exp) if (e.alive && e.ans === ans && e.t > now && e.t < to) return true;
    return false;
  }

  /** How many dodge-only things wait on the floor right now (marks, the storm still to fall, what
   *  was expected): the hazard ceiling reads it. */
  liveHazards() {
    let n = 0;
    for (let i = 0; i < this.nPred; i++) if (this.pred[i].ans === DODGE) n++;
    for (const e of this.exp) if (e.alive && e.ans === DODGE) n++;
    return n;
  }
}

export { GUARD, DODGE };
