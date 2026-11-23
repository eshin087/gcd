import * as THREE from 'three';
import { TELL, RESULT } from '../../../combat/rules.js';

// THE FLURRY BURST (the rework, ADR-168; COMBAT.md → "The One Who Woke"): a beat with
// `flurry: { n, dur, cap }` (moves.js `burst(...)`). It is ONE blow to the rules: one cue (its own
// tell), one windup >= TUNING.minFirstWindup, one glint, one lit interval in the cue ledger (the engine's
// `sustain` + `selfHit`: duelist/brain.js header). From its impact `n` blows are DRAWN over `dur` s (the
// limbs alternate at about ten a second, a fan of afterimages, a fast patter), and the hero's answer is
// decided ONCE, by the first blow that finds him:
//   parried (or met by his own cut)  the whole burst is turned: sparks on the blade each blow, no more
//                                    presses; it costs Xin Yi posture as a heavy deflect
//   blocked                          a held guard pays at most `cap` guard for the whole burst, never health
//   dodged (i-frames, a perfect one)  every blow of it passes
//   hit                              ONE stagger (the first blow), then the others are chip that never
//                                    re-stagger (each under player.js minStaggerDamage, no knock-back) and
//                                    push him out of reach by the burst's end; the total is the beat's damage
// Blows before the first that finds him find nobody (out of the zone: whiffs). Game rolls: none (the
// limbs alternate by index), so the seeded sims replay.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** The first blow's share of the burst's damage (the one that staggers); the rest are chip. */
const FIRST = 0.34;
/** The first blow's share of the guard cost a held guard pays (the rest spread over the others). */
const GUARD_FIRST = 0.4;
/** m the hero is pushed by each chip blow (out of reach by the end). */
const CHIP_PUSH = 0.26;

export class FlurryMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.cur = null; // { b, a, i, n, res, cost, cap, dmg }
    this.stats = { bursts: 0, blows: 0, parried: 0, blocked: 0, dodged: 0, hit: 0, whiff: 0, chip: 0, guard: 0 };
  }

  drop() {
    this.cur = null;
  }

  /** Is beat b a burst. */
  static is(b) {
    return !!b?.def?.flurry;
  }

  /** The burst's impact (its first blow). True: handled. */
  onImpact(b, s, a) {
    const F = b.def.flurry;
    if (!F) return false;
    const n = Math.max(2, Math.round(fin(F.n, 7)));
    this.cur = { b, a, i: 0, n, res: null, cost: 0, cap: fin(F.cap, 30), dmg: fin(b.def.damage, 16) };
    this.stats.bursts++;
    this._blow(s);
    return true;
  }

  /** A tick of the lit window: the next blow. */
  onSustain(b, s, a) {
    if (!b.def.flurry || this.cur?.b !== b) return;
    this._blow(s);
  }

  /** Every frame: a burst whose move is gone is over. */
  frame() {
    const C = this.cur, d = this.d;
    if (!C) return;
    const gone = d.brain.act !== C.a || d.mode !== 'act';
    if (!gone && !(C.i >= C.n && C.a.t >= C.b.end)) return;
    // (a burst of his streak flurry that never found the hero settles the streak as a whiff)
    if (C.res === null && C.a.streak && !gone) {
      const p = this.game.player?.position;
      const near = !!p && Math.hypot(p.x - d.position.x, p.z - d.position.z) <= fin(C.b.def.zone?.r, 2) + 1.2;
      d.onStreakBlow?.(C.a, C.b, null, near);
    }
    this.cur = null;
  }

  _blow(s) {
    const C = this.cur, d = this.d;
    if (!C || C.i >= C.n) return;
    const i = C.i++;
    this.stats.blows++;
    const D = C.b.def;
    this._draw(C, i);
    const p = this.game.player;
    if (!p || !s) return;
    const inZone = !!d.brain._inZone?.(D.zone, s, !!D.air);
    // the push and the sparks go along the line from him to the hero
    const dx = s.dist > 1e-3 ? (p.position.x - d.position.x) / s.dist : Math.sin(d.yaw);
    const dz = s.dist > 1e-3 ? (p.position.z - d.position.z) / s.dist : Math.cos(d.yaw);
    if (C.res === null) {
      if (!inZone) {
        this.stats.whiff++;
        return;
      }
      // THE ONE RESULT: the first blow that finds him decides the whole burst
      const r = d.hitPlayer({
        damage: C.dmg * FIRST, knockback: 0.5, kind: 'slash', tell: D.tell ?? TELL.NORMAL, attack: C.a.name,
        from: { x: d.position.x, z: d.position.z }, beat: C.b, extra: { guardCost: C.cap * GUARD_FIRST, burst: true },
      });
      if (r === RESULT.IGNORED) return;
      C.res = r === RESULT.CLASHED ? RESULT.PARRIED : r === RESULT.PERFECT ? RESULT.DODGED : r;
      if (C.res === RESULT.PARRIED) {
        this.stats.parried++;
        // (as a heavy deflect: the parry's own posture comes from duelist.onParried; the rest here)
        d.addPosture(fin(d.T.burst?.parryPosture, 20));
      } else if (C.res === RESULT.BLOCKED) {
        this.stats.blocked++;
        C.cost += C.cap * GUARD_FIRST;
        this.stats.guard += C.cap * GUARD_FIRST;
      } else if (C.res === RESULT.DODGED) this.stats.dodged++;
      else if (C.res === RESULT.HIT) this.stats.hit++;
      C.b.landed = C.res === RESULT.HIT;
      if (C.res === RESULT.HIT || C.res === RESULT.BLOCKED) C.a.chain = 0;
      // (a burst in his streak flurry: its one result is the streak's blow, duelist.onStreakBlow)
      if (C.a.streak) d.onStreakBlow?.(C.a, C.b, r);
      return;
    }
    const left = C.n - i; // (the blows still to come, this one included)
    if (C.res === RESULT.PARRIED) {
      // turned: sparks on the blade, nothing else
      if (inZone) this._spark(p, dx, dz);
      return;
    }
    if (C.res === RESULT.BLOCKED) {
      // a held guard pays the rest of the cap, spread over the blows; never health
      if (!inZone || !p.blocking) return;
      const want = Math.max(0, C.cap - C.cost) / Math.max(1, left);
      if (want > 0 && typeof p.streamBlock === 'function' && p.streamBlock(want, 0.1, dx, dz)) {
        C.cost += want;
        this.stats.guard += want;
      }
      this._spark(p, dx, dz);
      return;
    }
    if (C.res === RESULT.HIT) {
      // chip: no stagger, no knock-back (player.js chipGuard / minStaggerDamage), a little push away
      if (!inZone || p.blocking || p.isInvulnerable?.() || p.alive === false) return;
      const share = (C.dmg * (1 - FIRST)) / Math.max(1, C.n - 1);
      d.hitPlayer({
        damage: share, knockback: 0, kind: 'slash', tell: D.tell ?? TELL.NORMAL, attack: C.a.name, from: { x: d.position.x, z: d.position.z },
        parryable: false, blockable: false, extra: { perfect: false, burst: true },
      });
      this.stats.chip++;
      this._push(p, dx, dz, CHIP_PUSH);
    }
  }

  /** Slide the hero `m` m along (dx, dz) (player.js streamBlock's push: his knock-back velocity). */
  _push(p, dx, dz, m) {
    const kb = p.kb;
    if (!kb) return;
    const v = m * 6; // (player.js TUNE.knockbackDecay: slide distance = knock-back m)
    const now = fin(kb.x) * dx + fin(kb.z) * dz;
    if (now < v) {
      kb.x = fin(kb.x) + dx * (v - now);
      kb.z = fin(kb.z) + dz * (v - now);
    }
  }

  _spark(p, dx, dz) {
    const c = p.getChestPos?.(this._w, true);
    if (!c) return;
    this.d.fx.guard?.(c.x - dx * 0.4, c.y, c.z - dz * 0.4, { heavy: false, deflect: true });
  }

  /** One drawn blow: the striking limb's trail, an afterimage every other blow, the patter. */
  _draw(C, i) {
    const d = this.d, fx = d.fx;
    const D = C.b.def;
    const kind = D.flurry.kind ?? 'chain';
    const part = kind === 'kicks' ? (i % 2 ? 'footL' : 'footR') : kind === 'right' ? 'fistR' : i % 2 ? 'fistL' : 'fistR';
    try {
      const a = this._v, b = this._w;
      d._limbSeg?.(part, a, b);
      if (Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z)) {
        // a fan: the limb's line and two more a little off it (the arms seen at once)
        for (let k = -1; k <= 1; k++) {
          const o = 0.12 * k;
          fx.limbTrail?.(a.x + o, a.y + o * 0.5, a.z, b.x + o, b.y + o * 0.5, b.z - o, d.phase, false);
        }
      }
      if (i % 2 === 0) fx.afterimages?.(d, 1);
    } catch (err) {
      console.error('[wokenOne] burst draw', err);
    }
    d.emit('dragon:burst', { i, n: C.n, kind, x: d.position.x, z: d.position.z });
  }
}
