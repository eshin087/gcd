import * as THREE from 'three';
import { TELL, TELL_STYLE } from './rules.js';
import { BLOW } from '../world/breakTuning.js';

// THE BLACK IMPACT (?blackImpact=0|a; default a; ADR-271, the owner 2026-11-27: "we need all blackout attacks
// to end with a devastating impact even if it misses the player ... always have the blackout attack one of the
// strongest most impactful heavy attacks that players or the environment will feel"). A black blow, hit or
// miss, lands with the heaviest blow a boss has: where its striking part comes down, the ground takes a blast
// (a crater and its scorch, every breakable in `r` struck with `power`: what stands there breaks), a ragged
// shock front of dust runs out `shock` m, the grass and the living world are thrown by it, a pale light
// flashes, the camera takes a hard shake and a punch, the frame holds for `stop` s (not when the blow hit the
// hero: his hit has its own), and the sound is an explosion with the sub under it and the music ducked.
// Numbers: TELL_STYLE.black.impact. `0`: the blow lands as before (only what its own move does).
//
// Generic: no boss calls it. The black `combat:flash` (the cue) arms it with the boss in the slot
// (`game.boss`): a duelist's black beat in his act (brain.act: it fires as the act's clock passes the beat's
// impact; the striking part from `tellPoint`), the wyrm's beat in its action (brain.action: a.T past
// b.at + b.impactIn; the striking part its mouth), anything else `lead` s after the cue. If the act / action is
// gone before the impact (a stagger, a posture break, death, a Lab interrupt), the blow never landed: nothing.
// A retry or a change of state disarms it. Owned and stepped by ui/tells.js (`game.blackImpact`), with the
// blackout. Never throws (each step guarded); no allocation per frame.

const OPTS = ['0', 'a'];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
export const BLACK_IMPACT_DEFAULT = 'a';
/** The switch (the Lab cycles it). */
export const BLACK_IMPACT = { opts: OPTS, mode: OPTS.includes(q('blackImpact')) ? q('blackImpact') : BLACK_IMPACT_DEFAULT };
export const getBlackImpact = () => BLACK_IMPACT.mode;
export const setBlackImpact = (m) => (BLACK_IMPACT.mode = OPTS.includes(m) ? m : BLACK_IMPACT_DEFAULT);

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class BlackImpact {
  constructor(game) {
    this.game = game;
    this.armed = false;
    this.d = null; // the boss whose blow is coming
    this.act = null; // a duelist's act / the wyrm's action at the cue (null: the timer alone)
    this.beat = null; // its black beat
    this.duel = false; // a duelist's act (true) or the wyrm's action
    this.dueAt = 0; // game time of the impact (the timer)
    this.hitHero = false; // the blow struck the hero (his own hit-stop is enough)
    this.p = new THREE.Vector3(); // (a boss's tellPoint writes a Vector3: some read their bones into it)
    this.o = { kind: 'blast', power: 1, r: 3, by: 'boss', hot: false };
    this.oi = { kind: BLOW.BLAST, by: 'boss', marked: true, y: 0.6, src: 0 };
    this.stats = { fired: 0, last: null }; // (tests, the Lab)
    this._src = 7100000;
    const ev = game?.events;
    ev?.on('combat:flash', (e) => {
      if (e && e.tell === TELL.BLACK && !e.hazard && !e.bullet) this.arm();
    });
    ev?.on('player:hurt', () => {
      if (this.armed) this.hitHero = true;
    });
    for (const n of ['game:retry']) ev?.on(n, () => this.disarm());
    ev?.on('state', (e) => {
      if (e?.to === 'title' || e?.to === 'dead' || e?.to === 'victory') this.disarm();
    });
  }

  disarm() {
    this.armed = false;
    this.act = this.beat = this.d = null;
  }

  /** The black cue: find the blow's beat on the boss in the slot and wait for its impact. */
  arm() {
    if (BLACK_IMPACT.mode === '0') return;
    const g = this.game, d = g?.boss ?? g?.dragon, I = TELL_STYLE.black.impact;
    if (!d) return;
    this.d = d;
    this.act = this.beat = null;
    this.hitHero = false;
    const now = fin(g.time);
    const A = d.brain?.act;
    if (A && Array.isArray(A.beats)) {
      // a duelist: his black beat still to land
      for (const b of A.beats) {
        if (!b.feint && b.def?.tell === TELL.BLACK && fin(b.impact, -1) >= fin(A.t) - 0.02) {
          this.act = A;
          this.beat = b;
          this.duel = true;
          break;
        }
      }
    } else if (d.brain?.action?.cur?.tell === TELL.BLACK) {
      this.act = d.brain.action;
      this.beat = d.brain.action.cur;
      this.duel = false;
    }
    this.dueAt = now + fin(I.lead, 0.32);
    this.armed = true;
  }

  /** Every frame (ui/tells.js): fire on the impact, drop a blow that never landed. */
  update() {
    if (!this.armed) return;
    try {
      const g = this.game, d = this.d;
      if (!d || BLACK_IMPACT.mode === '0') return this.disarm();
      if (d.state === 'dead' || d.state === 'dying' || d.mode === 'dying' || d.mode === 'dead') return this.disarm();
      let due;
      if (this.act) {
        const duel = this.duel;
        const live = duel ? d.brain?.act === this.act : d.brain?.action === this.act;
        if (!live) return this.disarm(); // cut short before it landed
        due = duel ? fin(this.act.t) >= fin(this.beat.impact) : fin(this.act.T) >= fin(this.beat.at) + fin(this.beat.impactIn);
      } else due = fin(g.time) >= this.dueAt;
      if (!due) {
        if (fin(g.time) > this.dueAt + 3) this.disarm(); // (a stale arm: never hold one forever)
        return;
      }
      this.armed = false;
      this.fire(d);
      this.act = this.beat = this.d = null;
    } catch (err) {
      this.disarm();
      console.error('[blackImpact]', err);
    }
  }

  /** Where the blow comes down: its striking part over the ground (a body's own spot: in front of it). */
  _point(d) {
    const p = this.p, w = !d.kit && d.rig?.pt?.mouth;
    if (w && Number.isFinite(w.x + w.z)) p.copy(w);
    else if (typeof d.tellPoint === 'function') d.tellPoint(this.beat?.def?.part, p);
    else p.copy(d.position);
    const fx = Math.sin(fin(d.yaw)), fz = Math.cos(fin(d.yaw));
    const ox = p.x - d.position.x, oz = p.z - d.position.z;
    // (a part held at the body, a fist or a blade drawn back: the blow lands a stride in front of him)
    if (!(ox * fx + oz * fz > 0.9)) p.set(d.position.x + fx * 1.6, p.y, d.position.z + fz * 1.6);
    return p;
  }

  /** The devastating impact at the blow's point (see the header). */
  fire(d) {
    const g = this.game, I = TELL_STYLE.black.impact, wyrm = !d.kit, s = wyrm ? I.wyrm : 1;
    const p = this._point(d), x = p.x, z = p.z;
    if (!Number.isFinite(x + z)) return;
    const W = g.world;
    // the ground: a crater and its scorch, the grass torn out, what stands in the disc struck
    const o = this.o;
    o.power = I.mark;
    o.r = I.r * s;
    W?.groundBlow?.(x, z, o);
    const oi = this.oi;
    oi.src = this._src = (this._src % 7199999) + 1;
    W?.impact?.(x, z, I.r * s, I.power, oi);
    W?.gust?.(x, z, I.gust, I.shock * s * 1.4);
    // the shock front: a duelist's ragged front of dust, the wyrm's own recipe at its size
    const F = d.fx;
    if (typeof F?.shock === 'function') F.shock(x, z, I.shock * s, { k: I.k, kind: 'dust', echo: true });
    else F?.groundShock?.(x, z, I.shock * s, I.k);
    g.lights?.add?.({ x, y: 1.2, z, color: I.light, intensity: I.lightK, radius: I.shock * s * 1.6, life: 0.32, fade: 0.28 });
    // the hero feels it wherever he stands, more near it
    const h = g.player?.position, dist = h ? Math.hypot(h.x - x, h.z - z) : 99, near = Math.max(0, 1 - dist / (I.near * s));
    g.shake?.(I.shake[0] + (I.shake[1] - I.shake[0]) * near);
    g.punch?.(I.punch * (0.5 + 0.5 * near));
    if (!this.hitHero && I.stop > 0) g.hitstop?.(I.stop, 0.06);
    // the sound: an explosion, the sub under it, the music ducked
    const A = g.audio;
    A?.play?.('explosion', { x, z, radius: I.shock * s });
    A?.play?.('sub', { k: I.sub });
    A?.thump?.dip?.(1);
    this.stats.fired++;
    this.stats.last = { x, z, t: fin(g.time), hit: this.hitHero, near };
  }
}
