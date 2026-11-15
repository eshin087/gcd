import { CONFIG } from '../core/config.js';
import { DEFENSE } from '../combat/rules.js';
import { ARTS } from '../entities/player/flurry.js';
import { TUNING as WYRM, SCALE as WYRM_SCALE } from '../entities/dragon/tuning.js';

// Training (ADR-099; usage: src/dev/README.md → Training): a fighting game's training mode for the
// boss of the level loaded. A catalogue of SITUATIONS by category, each one click: the runner puts
// the fight in place (the flow in 'boss', the boss's AI off, god mode, the hero placed, the streaks
// set), starts it (a boss move, a hero action, a debug call) and plays the hero's side itself: an
// auto-answer to every one of the boss's glints (parry, perfect parry, block, dodge, perfect dodge,
// mikiri, trade, nothing), clicks, holds and mashing, all through the input's virtual keys, so the
// game runs exactly as when a player does it. Then it waits for the situation to play out, holds a
// beat, and is done (or loops).
//
// Headless: nothing here needs the DOM. The panel (trainingPanel.js) is a view of it; the sims run
// every situation through `run(id)` (tests: integ / duel / lord TRAINING).
//
// A situation: { id, cat, name, desc, boss (kinds it applies to: 'wyrm' | 'duel' | 'ash' | 'lord' |
//   'any'), dist (m from the boss; omit = the boss's default), ang (rad off his facing), side (put the
//   hero beside him, for the camera), streak (the hero's, set before), foe (his streak), art (pin the
//   flurry's art), hp (the hero's), god (default true), answer (mode, or (i, T) → mode for blow i),
//   go(T) (start it), tick(T, dt) (every frame while it runs), until(T) (done; default: the boss's
//   move is over and the hero is free), tail (s held after), max (s at most), expect [events]
//   (what must have happened: the sims check) }

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DOWN = new Set(['dying', 'dead']);
const HERO_FREE = new Set(['idle', 'run', 'sprint']);

/** Answer modes: when to act before the impact (s), and what (Training._answer). */
export const ANSWERS = Object.freeze({
  parry: { label: 'Parry', lead: 0.12 },
  perfect: { label: 'Perfect parry', lead: 0.05 },
  block: { label: 'Block', lead: 0.6 },
  dodge: { label: 'Perfect dodge', lead: 0.1 },
  roll: { label: 'Dodge (early)', lead: 0.34 },
  mikiri: { label: 'Mikiri', lead: 0.15 },
  trade: { label: 'Trade', lead: 0.15 },
  none: { label: 'Take it', lead: 0 },
});

/** The boss of the level loaded: its kind and the moves the situations ask for by role. */
const ROLES = {
  cinderwood: { single: 'bite', string: 'clawCombo', long: 'stormFlurry', red: 'tail', area: 'stomp' },
  ash: { single: 'plumThrust', string: 'swallow', long: 'ashRain', red: 'lotus', lock: 'fallingStar', mikiri: 'piercingAsh' },
  starless: { single: 'lunge', string: 'litany', long: 'litany', red: 'reap', lock: 'skyfall' },
};

export function bossKinds(game) {
  const d = game.dragon;
  const k = new Set(['any']);
  if (typeof d?.onPlunge === 'function') k.add('wyrm');
  if (typeof d?.debug?.flurry === 'function') {
    k.add('duel');
    k.add(d?.lives ? 'lord' : 'ash');
  }
  return k;
}

// ------------------------------------------------------------------ the catalogue
const S = [];
const add = (cat, list) => {
  for (const s of list) S.push({ cat, god: true, tail: 0.8, max: 12, ...s });
};
const N = (n) => `×${n}`;

add('HERO STREAK', [
  ...[1, 2, 3, 5, 7].map((n) => ({
    id: `pd${n}`, name: `Perfect dodge · streak ${N(n)}`, boss: 'any', streak: n - 1, role: 'red', answer: 'dodge',
    desc: n === 1 ? 'The first perfect dodge of a streak: the art alone (against the wyrm, sometimes the plunge).' : `${n} perfect dodges in a row: ${n - 1} flash cut${n > 2 ? 's' : ''}, then an art. The hanging cuts burst on the last blow.`,
    // (a streak of one against the wyrm may be the plain plunge: no hanging cuts to burst)
    expect: n === 1 ? ['player:perfectDodge'] : ['player:perfectDodge', 'player:flurryEnd'],
  })),
  { id: 'pdString', name: 'Perfect-dodge a whole string', boss: 'any', streak: 0, role: 'long', answer: 'dodge', desc: 'Every blow of a long string perfect-dodged: the streak climbs blow by blow and every flurry is longer than the last.', expect: ['player:perfectDodge'] },
  { id: 'streakLost', name: 'Streak lost (hit at ×5)', boss: 'any', streak: 5, role: 'single', answer: 'none', desc: 'A blow that hurts ends the streak: the pips break and the log says so.', expect: ['player:streak'] },
  { id: 'streakKept', name: 'Streak kept (block at ×5)', boss: 'any', streak: 5, role: 'single', answer: 'block', desc: 'A blocked blow leaves the streak alone.', expect: ['player:block'] },
]);

add('HERO ARTS', [
  ...['skyfall', 'severing', 'heavensplit'].map((a) => ({
    id: `art-${a}`, name: `${ARTS[a].label} ${N(4)}`, boss: 'wyrm', art: a, desc: `Three flash cuts round the head, then ${ARTS[a].label}.`,
    go: (T) => T.p.debug.flurry(4, a), expect: ['player:flurryEnd'],
  })),
  ...['passing', 'falling', 'rising'].map((a) => ({
    id: `art-${a}`, name: `${ARTS[a].label} ${N(4)}`, boss: 'duel', art: a, desc: `Three flash cuts through him, then ${ARTS[a].label}; it ends at his back.`,
    go: (T) => T.p.debug.flurry(4, a), expect: ['player:flurryEnd'],
  })),
  { id: 'art-max', name: `The longest flurry ${N(7)}`, boss: 'any', desc: 'Six flash cuts and an art: the cap. The later cuts come faster and spark gold.', go: (T) => T.p.debug.flurry(7), expect: ['player:flurryEnd'] },
]);

add('PARRY & RIPOSTE', [
  { id: 'parry', name: 'Parry a single blow', boss: 'any', streak: 0, role: 'single', answer: 'parry', desc: 'A single blow parried: the clash, then the riposte (one flash cut) and back where you stood.', expect: ['player:parry', 'player:flurryEnd'] },
  { id: 'perfectParry', name: 'Perfect parry', boss: 'any', streak: 0, role: 'single', answer: 'perfect', desc: 'Pressed within 0.08 s of the impact: the gold clash and a beat of slow motion.', expect: ['player:parry'] },
  ...[3, 7].map((n) => ({ id: `riposte${n}`, name: `Riposte ${N(n)}`, boss: 'any', streak: n - 1, role: 'single', answer: 'parry', desc: `A parry at a streak of ${n}: ${n} flash cuts.`, expect: ['player:flurryEnd'] })),
  { id: 'deflect', name: 'Deflect a string', boss: 'any', streak: 0, role: 'string', answer: 'parry', desc: 'Every blow of a string parried in rhythm: each counts in the streak, the last is answered by the riposte.', expect: ['player:parry'] },
  { id: 'deflectLong', name: 'Deflect a long string', boss: 'any', streak: 0, role: 'long', answer: 'parry', desc: 'A long string parried blow for blow: watch the streak climb and the riposte at the end.', expect: ['player:parry'] },
  { id: 'blockString', name: 'Block a string', boss: 'any', role: 'string', answer: 'block', desc: 'The guard held through a string: chip damage, pushback, no riposte.', expect: ['player:block'] },
  { id: 'lock', name: 'Blade lock', boss: 'duel', role: 'lock', answer: 'perfect', mash: true, desc: 'A perfect parry of his heavy blow locks the blades: mash attack to win the push.', expect: ['player:lock'] },
  { id: 'trade', name: 'Trade clash', boss: 'duel', role: 'single', answer: 'trade', dist: 2.2, desc: 'Your cut meets his blow in the air: both blades thrown back, nobody hurt.', expect: ['combat:clash'] },
  { id: 'mikiri', name: 'Mikiri', boss: 'ash', role: 'mikiri', answer: 'mikiri', dist: 3.2, desc: 'A roll INTO his perilous thrust: you step on his blade.', expect: ['player:mikiri'] },
]);

add('BOSS STREAK', [
  { id: 'foeBuild', name: 'Build his streak, he answers', boss: 'duel', foe: 4, dist: 2.0, answer: 'parry', ai: true, desc: 'Strike into his guard: his streak climbs and his guard answers with his flurry. Parry every blow.', go: (T) => T.tap('Mouse0'), until: (T) => T.t > 1 && !T.moving() && T.heroFree(), max: 14, expect: ['dragon:flurry'] },
  ...[3, 5, 7].map((n) => ({ id: `foe${n}`, name: `His flurry ${N(n)} · parry all`, boss: 'duel', foe: n, dist: 2.6, answer: 'parry', desc: `${n} blows, each from another side. Parry every one and his posture breaks.`, go: (T) => T.d.debug.flurry(n), expect: ['dragon:flurryEnd', 'dragon:postureBreak'] })),
  { id: 'foePerfect', name: `His flurry ${N(5)} · perfect parries`, boss: 'duel', foe: 5, dist: 2.6, answer: 'perfect', desc: 'Every blow perfect-parried (each counts two toward the total).', go: (T) => T.d.debug.flurry(5), expect: ['dragon:flurryEnd'] },
  { id: 'foeBlock', name: `His flurry ${N(5)} · block all`, boss: 'duel', foe: 5, dist: 2.6, answer: 'block', desc: 'A held guard meets them from any side: he breaks too.', go: (T) => T.d.debug.flurry(5), expect: ['dragon:flurryEnd', 'dragon:postureBreak'] },
  { id: 'foeMiss', name: `His flurry ${N(5)} · one let through`, boss: 'duel', foe: 5, dist: 2.6, answer: (i) => (i === 2 ? 'none' : 'parry'), desc: 'The third blow lands: nothing breaks, and your streak is lost.', go: (T) => T.d.debug.flurry(5), expect: ['dragon:flurryEnd'] },
  { id: 'foeDodge', name: `His flurry ${N(4)} · perfect-dodge it`, boss: 'duel', foe: 4, dist: 2.6, answer: 'dodge', desc: 'Perfect dodges answer his blows with flurries of your own (they break nothing of his).', go: (T) => T.d.debug.flurry(4), expect: ['player:perfectDodge'] },
]);

add('OFFENCE', [
  { id: 'chain', name: 'Light chain (5 hits)', boss: 'any', desc: 'The five-hit chain into the slam.', dist: 2.4, wyrmDist: 3.2, go: () => {}, tick: (T) => T.every(0.36, 5, () => T.tap('Mouse0')), until: (T) => T.t > 2.4 && T.heroFree(), expect: ['player:attack'] },
  { id: 'cleave', name: 'Charged cleave', boss: 'any', desc: 'Hold attack to full charge, release: the dashing cleave.', dist: 4.5, wyrmDist: 5, go: (T) => T.hold('Mouse0', 1.3), until: (T) => T.t > 1.9 && T.heroFree(), expect: ['player:charge'] },
  { id: 'critChain', name: 'Crit window after a Ghostep', boss: 'any', streak: 0, role: 'red', answer: 'dodge', desc: 'A perfect dodge, then the chain inside the crit window.', after: (T) => T.everyFrom(T.afterT, 0.36, 5, () => T.tap('Mouse0'), 'crit'), until: (T) => T.afterT >= 0 && T.t - T.afterT > 2.2 && T.heroFree(), expect: ['player:perfectDodge'] },
  { id: 'execute', name: 'Posture break → execution', boss: 'any', desc: 'His posture broken, an attack near him executes him (the deathblow on the Starless Lord ends a form).', dist: 2.6, wyrmDist: 4, go: (T) => T.d.debug.postureBreak(), tick: (T) => T.at(0.6, () => T.tap('Mouse0')), until: (T) => T.t > 1 && T.heroFree() && !T.moving(), max: 9, expect: ['player:plungeHit'] },
  { id: 'crush', name: 'Guard crush (full charge)', boss: 'duel', dist: 3.6, desc: 'A full-charge cleave into his raised guard crushes it: he staggers.', go: (T) => T.hold('Mouse0', 1.3), until: (T) => T.t > 2 && T.heroFree(), expect: ['player:charge'] },
]);

add('GETTING HIT', [
  { id: 'hit', name: 'Hit (stagger)', boss: 'any', role: 'single', answer: 'none', desc: 'A blow taken: the flinch, the freeze, the red edge.', expect: ['player:hurt'] },
  { id: 'knockdown', name: 'Knocked down (red blow)', boss: 'any', role: 'red', answer: 'none', desc: 'A red blow taken: down, and back up.', until: (T) => T.t > 1 && T.heroFree() && !T.moving(), expect: ['player:hurt'] },
  { id: 'guardBreak', name: 'Guard broken (blocking red)', boss: 'any', role: 'red', answer: 'block', desc: 'A red blow cannot be blocked: the guard shatters.', until: (T) => T.t > 1 && T.heroFree() && !T.moving(), expect: ['player:guardBreak'] },
  { id: 'death', name: 'Death', boss: 'any', role: 'red', answer: 'none', god: false, hp: 1, desc: 'The killing blow and the fall (the next situation brings you back).', until: (T) => T.t > 3.5, expect: ['player:died'] },
]);

add('BOSS STATES', [
  { id: 'stagger', name: 'Stagger', boss: 'any', desc: 'His stagger.', go: (T) => T.d.debug.stagger(), until: (T) => T.t > 1.2 && !T.moving(), expect: [] },
  { id: 'break', name: 'Posture break', boss: 'any', desc: 'His posture breaks: open to crits.', go: (T) => T.d.debug.postureBreak(), until: (T) => T.t > 3.6, expect: ['dragon:postureBreak'] },
  { id: 'phase2', name: 'Phase 2', boss: 'any', desc: 'The second phase begins (its transition).', go: (T) => T.d.debug.phase2(), until: (T) => T.t > 1 && !T.moving(), max: 10, expect: [] },
  { id: 'phase3', name: 'Phase 3', boss: 'wyrm', desc: 'The third phase: the wyrm burns white-hot.', go: (T) => T.d.debug.phase3(), until: (T) => T.t > 1 && !T.moving(), max: 10, expect: [] },
  { id: 'phase3l', name: 'Form 3', boss: 'lord', desc: 'His third blade form ignites.', go: (T) => T.d.debug.phase3(), until: (T) => T.t > 1 && !T.moving(), max: 10, expect: [] },
  { id: 'phase4', name: 'Form 4', boss: 'lord', desc: 'His fourth form: the Void answers him.', go: (T) => T.d.debug.phase4(), until: (T) => T.t > 1 && !T.moving(), max: 10, expect: [] },
  { id: 'bossDeath', name: 'His death', boss: 'any', desc: 'The killing blow (the next situation wakes him again).', go: (T) => T.d.debug.kill(), until: (T) => T.t > 4, expect: [] },
]);

export const SITUATIONS = Object.freeze(S);
export const CATEGORIES = Object.freeze([...new Set(S.map((s) => s.cat)), 'BOSS MOVES']);

// ------------------------------------------------------------------ the runner
export class Training {
  constructor(game) {
    this.game = game;
    this.cur = null; // the situation running
    this.ph = 'idle'; // idle | prep | settle | place | run | tail | done
    this.t = 0; // game s in this phase
    this.t0 = 0; // game time the situation's go() ran
    this.loop = false;
    this.moveAnswer = 'parry'; // the answer to a BOSS MOVES situation
    this.events = new Map(); // what happened since go(): name → count
    this.blow = 0; // the boss's glints since go()
    this.pending = []; // answers due: { at, mode, i }
    this.holds = new Map(); // virtual codes held: code → release time (game s)
    this.marks = new Set(); // at() / every() bookkeeping
    this.timers = []; // later(): { at (game s), fn }
    this.afterT = -1; // phase time `after` began (critChain: the chain once the dodge is over)
    this.lastResult = null; // { id, ok, missing, secs }
    this.onChange = null; // the panel's refresh hook
    this._listening = false;
  }

  get p() {
    return this.game.player;
  }
  get d() {
    return this.game.dragon;
  }
  get running() {
    return !!this.cur && this.ph !== 'idle' && this.ph !== 'done';
  }

  /** The situations that apply to the boss loaded, the BOSS MOVES category included (one per move). */
  list() {
    const kinds = bossKinds(this.game);
    const out = SITUATIONS.filter((s) => kinds.has(s.boss) && this._roleOk(s));
    let ab = [];
    try {
      ab = this.d?.debug?.abilities?.() ?? [];
    } catch {
      ab = [];
    }
    for (const a of ab) {
      if (!a?.name) continue;
      out.push({
        id: `move-${a.name}`, cat: 'BOSS MOVES', name: a.label ?? a.name, boss: 'any', move: a.name, tell: a.tell, phase: a.phase,
        desc: `${a.label ?? a.name}, answered with the toolbar's answer.`, god: true, tail: 0.6, max: 16, answer: () => this.moveAnswer, expect: [],
      });
    }
    return out;
  }

  _roleOk(s) {
    return !s.role || !!this._roles()[s.role];
  }

  /** The boss's moves by role: the level's, else by his kind (the sims build no level). */
  _roles() {
    const id = this.game.level?.id;
    if (ROLES[id]) return ROLES[id];
    const k = bossKinds(this.game);
    return (k.has('wyrm') ? ROLES.cinderwood : k.has('lord') ? ROLES.starless : k.has('ash') ? ROLES.ash : null) ?? {};
  }

  find(id) {
    return this.list().find((s) => s.id === id) ?? null;
  }

  /** Start situation `id` (or the object). False when it does not apply to this boss. */
  run(id) {
    const s = typeof id === 'string' ? this.find(id) : id;
    if (!s) return false;
    this.stop(false);
    this._listen();
    this.cur = s;
    this._phase('prep');
    this._changed();
    return true;
  }

  /** Stop the situation running (inputs released; it stays selected for a replay). */
  stop(changed = true) {
    this._release();
    this.ph = 'idle';
    if (changed) this._changed();
  }

  replay() {
    if (this.cur) this.run(this.cur);
  }

  /** The next / previous situation in the list (wraps). */
  step(dir = 1) {
    const L = this.list();
    if (!L.length) return false;
    const i = this.cur ? L.findIndex((s) => s.id === this.cur.id) : -1;
    return this.run(L[(i + dir + L.length) % L.length]);
  }

  // ---------------------------------------------------------------- the frame (lab.update)
  update(realDt) {
    const s = this.cur;
    if (!s || this.ph === 'idle') return;
    const g = this.game, dt = fin(g.dt, 0);
    try {
      this.t += dt;
      this._releaseDue();
      for (let i = this.timers.length - 1; i >= 0; i--) {
        if (g.time < this.timers[i].at) continue;
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
      // aim at him: the swings and the facing follow the mouse ray
      const dp = this.d?.position;
      if (dp && g.mouseGround?.set) g.mouseGround.set(dp.x, 0, dp.z);
      switch (this.ph) {
        case 'prep':
          this._prep();
          break;
        case 'settle':
          if (this._bossFree() && this._heroFree()) this._place();
          else if (this.t > 5) {
            // something holds him (a transition, a reaction): start the fight over
            g.flow?.debug?.toState?.('boss');
            this.d?.debug?.setAI?.(!!s.ai);
            this._phase('settle2');
          }
          break;
        case 'settle2':
          if ((this._bossFree() && this._heroFree()) || this.t > 4) this._place();
          break;
        case 'place':
          this._pin();
          if (this.t >= 0.3) this._go();
          break;
        case 'run':
          this._run(dt);
          break;
        case 'tail':
          if (this.t >= fin(s.tail, 0.8)) this._finish();
          break;
        case 'done':
          if (this.loop && this.t > 0.4) this.run(s);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('[training] situation failed', s?.id, err);
      this._release();
      this.ph = 'done';
      this.lastResult = { id: s?.id, ok: false, missing: ['(error)'], secs: this.t };
      this._changed();
    }
  }

  _phase(ph) {
    this.ph = ph;
    this.t = 0;
  }

  _changed() {
    try {
      this.onChange?.();
    } catch (err) {
      console.error('[training] panel refresh failed', err);
    }
  }

  // ---------------------------------------------------------------- the steps
  _prep() {
    const g = this.game, s = this.cur, d = this.d, p = this.p;
    this._release();
    this.pending.length = 0;
    if (g.state !== 'boss' || DOWN.has(d?.state) || p?.alive === false) g.flow?.debug?.toState?.('boss');
    d?.debug?.setAI?.(!!s.ai);
    if (p?.debug) {
      p.debug.god = s.god !== false;
      p.debug.flurryArt = s.art ?? null;
      p.debug.noRiposte = false;
    }
    this._phase('settle');
  }

  _bossFree() {
    const d = this.d;
    if (!d || DOWN.has(d.state) || d.broken) return false;
    if (typeof d.mode === 'string') return d.mode === 'foot';
    return d.state === 'combat' && !d.brain?.action;
  }

  _heroFree() {
    const p = this.p;
    return !!p && p.alive !== false && HERO_FREE.has(p.state) && !(fin(this.game.hitstopTimer) > 0);
  }

  heroFree() {
    return this._heroFree();
  }

  /** Is his move (or reaction) still running? */
  moving() {
    const d = this.d;
    if (!d || DOWN.has(d.state)) return false;
    if (typeof d.mode === 'string') return d.mode === 'act' || d.mode === 'react' || d.mode === 'broken' || d.mode === 'intro';
    return !!d.brain?.action || d.state !== 'combat';
  }

  /** How far from him the hero stands: `dist` (a duelist) / `wyrmDist` (× the wyrm's size). */
  _dist() {
    const s = this.cur;
    if (bossKinds(this.game).has('wyrm')) return fin(s.wyrmDist, 6) * (WYRM_SCALE / 1.25);
    return fin(s.dist, 2.6);
  }

  _place() {
    const s = this.cur, d = this.d, p = this.p;
    const dist = this._dist(), a = fin(d.yaw) + fin(s.ang, 0);
    let x = d.position.x + Math.sin(a) * dist, z = d.position.z + Math.cos(a) * dist;
    const lim = fin(CONFIG.world.arenaRadius, 30) - 1.5, r = Math.hypot(x, z);
    if (r > lim) {
      x *= lim / r;
      z *= lim / r;
    }
    p.debug.teleport(x, z);
    p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z);
    p.debug.heal?.();
    if (Number.isFinite(s.hp)) p.hp = clamp(s.hp, 1, p.maxHp);
    if (Number.isFinite(s.streak)) p.debug.streak(s.streak);
    if (typeof d.debug?.streak === 'function') d.debug.streak(fin(s.foe, 0));
    // fresh enough to take the situation: half his bar at least, no posture
    if (d.hp < d.maxHp * 0.5) d.hp = d.maxHp;
    if (Number.isFinite(d.posture) && !d.broken) {
      d.posture = 0;
      d.emitPosture?.(true);
    }
    if (s.ai && d.brain) {
      d.brain.gapT = 99; // (his own moves held: only his answers to the hero)
      d.brain.raiseT = 0;
    }
    this._phase('place');
  }

  /** Hold the hero still and facing him (before go). */
  _pin() {
    const p = this.p, d = this.d;
    this._axis(0, 0);
    if (p && d) p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z);
  }

  _go() {
    const s = this.cur, d = this.d;
    this.events.clear();
    this.blow = 0;
    this.marks.clear();
    this.timers.length = 0;
    this.afterT = -1;
    this.t0 = this.game.time;
    this._phase('run');
    if (typeof s.go === 'function') s.go(this);
    else {
      const name = s.move ?? this._roles()[s.role];
      // (a later phase's move: a duelist is put into that phase at once, without its transition)
      if (s.move && fin(s.phase, 1) > fin(d.phase, 1) && typeof d.enterPhase === 'function') d.enterPhase(s.phase);
      if (name) d.debug?.trigger?.(name);
    }
    if (s.answer === 'block' || (typeof s.answer === 'function' && s.answer(0, this) === 'block')) this.hold('Mouse2', 99);
    this._changed();
  }

  _run(dt) {
    const s = this.cur, g = this.game, p = this.p;
    // answers due
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const A = this.pending[i];
      if (g.time < A.at) continue;
      this.pending.splice(i, 1);
      this._answer(A.mode);
    }
    if (s.mash && p?.state === 'lock') this.every(0.08, 999, () => this.tap('Mouse0'), 'mash');
    s.tick?.(this, dt);
    if (this.holds.has('Mouse2') && this.holds.get('Mouse2') > g.time + 1 && this.t > 0.6 && !this.moving()) {
      this.holds.delete('Mouse2');
      this._key('Mouse2', false);
    }
    if (s.after && this.events.has('player:perfectDodge') && (this.afterT >= 0 || HERO_FREE.has(p?.state))) {
      if (this.afterT < 0) this.afterT = this.t;
      s.after(this, dt);
    }
    const done = typeof s.until === 'function' ? s.until(this) : this.t > 0.6 && !this.moving() && this._heroFree() && !this.pending.length;
    if (done || this.t > fin(s.max, 12)) {
      this._release();
      this._phase('tail');
    }
  }

  _finish() {
    const s = this.cur;
    const missing = (s.expect ?? []).filter((n) => !this.events.has(n));
    this.lastResult = { id: s.id, ok: !missing.length, missing, secs: +(this.game.time - this.t0).toFixed(2) };
    this._release();
    this._phase('done');
    this._changed();
  }

  // ---------------------------------------------------------------- the hero's side
  _listen() {
    if (this._listening || typeof this.game.events?.on !== 'function') return;
    this._listening = true;
    const ev = this.game.events;
    const watch = (n) => ev.on(n, (e) => this._event(n, e));
    for (const n of ['player:parry', 'player:block', 'player:perfectDodge', 'player:flurry', 'player:flurryEnd', 'player:hurt', 'player:streak',
      'player:guardBreak', 'player:lock', 'player:mikiri', 'player:died', 'player:attack', 'player:charge', 'player:plungeHit', 'combat:clash',
      'dragon:flurry', 'dragon:flurryEnd', 'dragon:postureBreak', 'combat:flash']) watch(n);
  }

  _event(n, e) {
    if (!this.cur || this.ph !== 'run') return;
    this.events.set(n, (this.events.get(n) ?? 0) + 1);
    if (n !== 'combat:flash' || e?.source !== 'dragon' || e?.bullet || e?.hazard) return;
    const s = this.cur, i = this.blow++;
    const mode = typeof s.answer === 'function' ? s.answer(i, this) : s.answer;
    if (!mode || mode === 'none') return;
    if (mode === 'block') {
      this.hold('Mouse2', 99);
      return;
    }
    const A = ANSWERS[mode];
    if (!A) return;
    this.pending.push({ at: this.game.time + this._lead() - A.lead, mode, i });
  }

  /** The glint's lead on its impact for the boss loaded (s). */
  _lead() {
    const d = this.d, T = d?.T;
    if (T && T.flashLead !== undefined) {
      const v = T.flashLead;
      return Array.isArray(v) ? fin(v[Math.min(v.length, Math.max(1, fin(d.phase, 1))) - 1], 0.3) : fin(v, 0.3);
    }
    return fin(WYRM.flashLead, 0.35);
  }

  _answer(mode) {
    const p = this.p, d = this.d;
    if (!p || !d) return;
    const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz) || 1;
    switch (mode) {
      case 'parry':
      case 'perfect':
        this.holds.delete('Mouse2');
        this._key('Mouse2', false);
        this.tap('Mouse2', 0.05);
        break;
      case 'dodge':
      case 'roll':
        // across his line (axis y = north = −z)
        this._axis(-dz / l, -dx / l);
        this.tap('Space');
        this.later(0.3, () => this._axis(0, 0));
        break;
      case 'mikiri':
        this._axis(dx / l, -dz / l);
        this.tap('Space');
        this.later(0.3, () => this._axis(0, 0));
        break;
      case 'trade':
        this.tap('Mouse0');
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- inputs (the input's virtual keys)
  _key(code, down) {
    const inp = this.game.input;
    if (!inp) return;
    if (typeof inp.setVirtual === 'function') {
      inp.setVirtual(code, down);
      return;
    }
    // (the sims' input mock)
    const b = code === 'Mouse0' ? 0 : code === 'Mouse1' ? 1 : code === 'Mouse2' ? 2 : -1;
    if (b >= 0) {
      if (down) inp.press?.(b);
      else inp.up?.(b);
    } else if (down) inp.hold?.(code);
    else inp.release?.(code);
  }

  _axis(x, y) {
    const inp = this.game.input;
    if (!inp) return;
    if (typeof inp.setVirtualAxis === 'function') inp.setVirtualAxis(x, y);
    else inp.axis = { x, y };
  }

  /** Press `code` for `secs` game s (a tap: about two frames). */
  tap(code, secs = 0.03) {
    this.hold(code, secs);
  }

  hold(code, secs) {
    this._key(code, true);
    this.holds.set(code, this.game.time + Math.max(0.016, fin(secs, 0.03)));
  }

  _releaseDue() {
    const now = this.game.time;
    for (const [code, until] of this.holds) {
      if (now >= until) {
        this.holds.delete(code);
        this._key(code, false);
      }
    }
  }

  _release() {
    for (const code of this.holds.keys()) this._key(code, false);
    this.holds.clear();
    this.pending.length = 0;
    this.timers.length = 0;
    this._axis(0, 0);
  }

  /** Call `fn` in `secs` game s. */
  later(secs, fn) {
    this.timers.push({ at: this.game.time + Math.max(0, fin(secs, 0)), fn });
  }

  /** `n` times, every `gap` s from phase time `from`. */
  everyFrom(from, gap, n, fn, key = 'ef') {
    if (this.t < from) return;
    this.every(gap, n, fn, key, from);
  }

  /** Once, when this phase's clock passes `t` (s). */
  at(t, fn, key = `at${t}`) {
    if (this.t < t || this.marks.has(key)) return;
    this.marks.add(key);
    fn();
  }

  /** `n` times, every `gap` s from the start of the phase (or phase time `from`). */
  every(gap, n, fn, key = 'every', from = 0) {
    const k = Math.floor((this.t - from) / gap);
    if (k >= n) return;
    const mk = `${key}${k}`;
    if (this.marks.has(mk)) return;
    this.marks.add(mk);
    fn();
  }
}
