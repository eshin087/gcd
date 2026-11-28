// THE CLASH DANCE (`?clash=dance`; ADR-247). From research into Sekiro's deflects (docs/ROADMAP.md P4): the
// ring of the steel is the rhythm of the fight, and deflects close together pay more than the same deflects
// spread out. The owner picked it as the second of the five combat additions (2026-11-26) and approved the
// build with three calls: it stands on its own (it never touches the deathblow's count of perfect parries,
// ADR-211), the ring rises only a little, and every duelist recovers posture in steps by his health.
//
// With it on, against the duelists' engine (duelist.js and every boss built on it):
//   1  THE RUN. Every parry of a blow of his body or his blade inside ONE of his moves (a string, a flurry)
//      counts one more in the run; its posture (POSTURE.parry x POSTURE.perfect, as today) is multiplied by
//      DEFENSE.clashDance.mult[run - 1] (the last value is the cap). Thrown things (sword qi, bolts,
//      bullets) neither count nor reset it. The run starts over when his move ends (a new move), when a
//      blow lands on the hero (player.hurtN moved: a hit or a guard broken; a contact stream's chip is no
//      blow), or after `gap` s with no parry.
//   2  THE RING. The parry's recorded clang (audio.js _parry) rises with the run: `ring.semis` semitones a
//      parry (at most `ring.semisMax`) and `ring.db` dB louder a parry (at most `ring.dbMax`), on top of the
//      deflect chain's weight (audio/parryChain.js). player:parry carries the run as `clash` (0 with it off).
//   3  THE RECOVERY. His posture drains back by `regenByHp`: the rate x the first step whose HP fraction he
//      is at or above. For a boss whose tuning already scales by HP (posture.regenByHp: the Starless Lord,
//      Tian Lei, Xin Yi, from x1.5 on a full bar to x0.5 on an empty one) the steps replace that curve: never
//      faster than today at any HP.
//
// The default in the game since the owner picked it from film (2026-11-27, "Make it default"). Off (`?clash=0`)
// every number is as before: the multiplier is 1, the ring is the deflect chain's alone and the recovery is each
// boss's own.

import { DEFENSE } from './rules.js';

const IDS = ['0', 'dance'];
export const CLASH_IDS = IDS;
// the game's default: the dance (the owner's pick from the film, 2026-11-27). The headless sims keep today's numbers
// unless a scenario sets it (their checks are written for them; duel / lord `clashdance` play it), as the flash chain
export const DEFAULT_CLASH = 'dance';
let mode = '0';

/** '0' (today) or 'dance'. */
export const clashMode = () => mode;
export const clashOn = () => mode === 'dance';
export function setClashMode(m) {
  if (!IDS.includes(m)) return false;
  mode = m;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('clash') : null;
  if (typeof location !== 'undefined') mode = q && IDS.includes(q) ? q : DEFAULT_CLASH;
}

const C = () => DEFENSE.clashDance;

/** The posture multiplier of the run's n-th parry (n >= 1; 1 with the dance off). */
export function clashMult(n) {
  if (!clashOn()) return 1;
  const M = C().mult;
  const i = Math.max(0, Math.min(M.length - 1, Math.floor(Number(n) || 1) - 1));
  return M[i] ?? 1;
}

/**
 * The run a parry would make now (no change): `run` the attacker's { act, n, t, hurt } (or null), `act` his
 * move now, `t` the hero's clock, `hurt` the hero's hurtN. 0 with the dance off.
 */
export function clashNext(run, act, t, hurt) {
  if (!clashOn()) return 0;
  if (!run || !act || run.act !== act || run.hurt !== hurt || !(t - run.t <= C().gap)) return 1;
  return Math.min(99, run.n + 1);
}

/** The posture recovery's factor at HP fraction `hp` (0..1); 1 with the dance off. */
export function clashRegenK(hp) {
  if (!clashOn()) return 1;
  const f = Number.isFinite(hp) ? hp : 1;
  for (const [at, k] of C().regenByHp) if (f >= at) return k;
  return C().regenByHp.at(-1)?.[1] ?? 1;
}

/** The ring's [gain, rate] multipliers for run n (1, 1 below 2 or with the dance off). */
export function clashRing(n) {
  const R = C().ring;
  const s = clashOn() ? Math.max(0, Math.floor(Number(n) || 0) - 1) : 0;
  if (s <= 0) return [1, 1];
  const db = Math.min(R.dbMax, R.db * s), semis = Math.min(R.semisMax, R.semis * s);
  return [Math.pow(10, db / 20), Math.pow(2, semis / 12)];
}
