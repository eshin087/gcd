import { LIGHT, HEAVY, CLEAVE } from '../../entities/player/combat.js';
import { clamp, smoothstep } from '../../core/math.js';
import { IDLE_GESTURES } from './idles.js';

const duration = (d) => d.windup + d.active + d.recovery;
const cut = (d, label) => ({ key: 'attack', label, duration: duration(d), def: d, fight: true });
const ease = (n = 2) => ({ key: 'loco', label: 'At ease', duration: n });
const guard = (n = 2) => ({ key: 'loco', label: 'Ready guard', duration: n, fight: true });
const walk = (speed, n, label, sprint = false) => ({ key: 'loco', label, speed, duration: n, sprint });
const block = { key: 'block', label: 'Brace & block', duration: 1.7, fight: true };
const charge = { key: 'charge', label: 'Gather', duration: 1.5, fight: true };
const roll = { key: 'roll', label: 'Dodge & recover', duration: 0.6, fight: true };

export const SEQUENCES = {
  showcase: { label: 'Full sequence', description: 'A continuous study of rest, readiness, footwork and force.', steps: [
    ease(2.5), guard(2), walk(1.5, 2, 'Walk'), walk(4.6, 2, 'Run'),
    walk(7.2, 1.6, 'Sprint', true), guard(0.9), ...LIGHT.map((d, i) => cut(d, `Light ${i + 1}`)),
    block, charge, cut(CLEAVE, 'Charged cleave'), guard(0.7), roll, guard(1.5), ease(2),
  ] },
  idle: { label: 'At ease', description: 'Relaxed shoulders, a soft knee and a quiet breath.', steps: [ease(7)] },
  idleLife: { label: 'All six idle gestures', description: 'Every idle gesture, including its entry and exit. Tempered keeps the free hand off the belt.', steps: [ease(0.8), ...IDLE_GESTURES.flatMap((g, i) => [{ key: 'loco', label: g.label, fidget: i, duration: g.duration }, ease(0.7)])] },
  guard: { label: 'Ready guard', description: 'An oblique blade, supported elbow and active free hand.', steps: [guard(7)] },
  walk: { label: 'Walk → run', description: 'Speed-matched footsteps with a steadier chest and head.', steps: [ease(0.5), walk(1.5, 3, 'Walk'), walk(4.6, 3, 'Run'), ease(1.5)] },
  sprint: { label: 'Sprint → stop', description: 'Acceleration, forward intent and a weighted stop.', steps: [ease(0.7), walk(7.2, 3.5, 'Sprint', true), ease(2)] },
  combo: { label: 'Five-hit chain', description: 'The hips drive the cuts; the finish has time to read.', steps: [guard(0.8), ...LIGHT.map((d, i) => cut(d, `Light ${i + 1}`)), guard(1.3)] },
  heavy: { label: 'Heavy attacks', description: 'Tempered opens with a dashing slash, followed by rising cut, sweep, falling cut and earthbreaker.', steps: HEAVY.flatMap((d, i) => [guard(0.5), cut(d, `Heavy ${i + 1}`)]).concat(guard(1)) },
  charge: { label: 'Charged cleave', description: 'Gather, hold a quiet breath, commit, then settle.', steps: [guard(0.8), { ...charge, label: 'Gather & hold', duration: 3, chargeDuration: 1.5 }, cut(CLEAVE, 'Charged cleave'), guard(1.4)] },
  defense: { label: 'Block & dodge', description: 'A braced guard followed by the existing roll and recovery.', steps: [guard(0.8), block, roll, guard(1.5)] },
};
for (const s of Object.values(SEQUENCES)) s.duration = s.steps.reduce((n, step) => n + step.duration, 0);

// The audition is a deterministic pilot, not a combat simulation. Both actors
// receive the same clip, clock and root path. No inputs, save data or game flow.
export class StudySequence {
  constructor(actors) { this.actors = actors; this.select('showcase'); }
  select(id) {
    this.id = Object.hasOwn(SEQUENCES, id) ? id : 'showcase';
    this.sequence = SEQUENCES[this.id];
    this.time = this.local = 0; this.index = -1;
    this.actors.forEach((a) => a.reset());
    // Settle cloth and the reference stance identically before starting.
    this.actors.forEach((a) => {
      for (let i = 0; i < 90; i++) a.update(1 / 120);
    });
    this.enter(0);
  }
  enter(i) {
    this.index = i; this.local = 0;
    this.step = this.sequence.steps[i];
    for (const a of this.actors) {
      // HeroAnimator's foot scratch buffer is module-local. Refresh it for this
      // actor before play() carries walking feet across the next transition.
      a.update(0);
      const p = a.pilot, s = this.step;
      p.atk = s.def ? { def: a.attackDef(s.def), pending: false, relT: -1, hitAt: -1 } : null;
      p.state = s.sprint ? 'sprint' : s.speed ? 'run' : s.key === 'loco' ? 'idle' : s.key;
      p.animT = p.stateT = 0;
      p.debug.fightStance = !!s.fight;
      p.guardHold = 0;
      p.releaseK = s.def === CLEAVE ? 1 : 0;
      a.anim.forceVariant = 0;
      a.anim.play(s.key, s.key === 'attack' ? 0.07 : 0.18, s.key === 'attack');
    }
  }
  tick(dt) {
    const remain = this.step.duration - this.local;
    const h = Math.min(dt, Math.max(0, remain));
    this.local += h; this.time += h;
    const s = this.step, t = this.local;
    for (const a of this.actors) {
      const p = a.pilot;
      p.animT = p.stateT = t;
      p.chargeK = s.key === 'charge' ? clamp(t / (s.chargeDuration ?? s.duration), 0, 1) : 0;
      if (this.id === 'idleLife') {
        const F = a.anim.fidget;
        F.k = s.fidget ?? -1; F.t = Math.max(0, t - h); F.cut = false; F.wait = Infinity;
        if (F.k < 0) F.w = 0;
      }
      let speed = s.speed ?? 0;
      if (s.def) {
        const d = s.def;
        const start = Math.max(0, d.windup - 0.08), end = d.windup + d.active * 0.7;
        const u = clamp((t - start) / (end - start), 0, 1);
        // Derivative of smoothstep: a real push-off / brake, identical for A/B.
        speed = (d.lunge ?? 0.55) * 6 * u * (1 - u) / (end - start);
      }
      if (s.key === 'roll') speed = 7 * (1 - smoothstep(0.3, 0.6, t));
      const k = 1 - Math.exp(-14 * h);
      p.groundVel.z += (speed - p.groundVel.z) * k;
      p.position.z += p.groundVel.z * h;
      a.update(h);
    }
    if (this.local >= s.duration - 1e-8) {
      if (this.index + 1 < this.sequence.steps.length) this.enter(this.index + 1);
      else this.select(this.id);
    }
    if (dt - h > 1e-7) this.tick(dt - h);
  }
  seek(t) {
    const target = clamp(t, 0, this.sequence.duration - 1 / 240);
    this.select(this.id);
    while (this.time + 1 / 120 < target) this.tick(1 / 120);
    if (target > this.time) this.tick(target - this.time);
  }
}
