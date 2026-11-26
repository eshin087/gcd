// The remade hero's move table (`?hero=new`, adapter.js): which recorded clip each game move plays.
// ONE data file. Every entry names the clip it WANTS (the name its set's author gives it, from the
// footage's chapter) and the clips it falls back to until that set is built; the adapter plays the first
// one the registry has. No combat number lives here: attacks are fitted to their game defs
// (player/combat.js windup / active / recovery) by fit.js.
//
//   want      the clip that will play once its set is built (CATALOG chapter in `ch`)
//   use       fallbacks, in order, from clips that exist today
//   how       'attack'  fitted to the def's windup / active / recovery (the attack clock, atk.t)
//             'charge'  the coil reached in `coil` s, then held while the button is held
//             'roll'    the clip's flight fitted to the roll's (landing at `land`: the frame it lands)
//             'once'    played from `from` (frame) at `rate`, its last frame held
//             'loop'    looped
//             'hold'    frame `at` held (a still stand-in)
//   contact   0..1: how much its planted feet are pinned (0 where the game moves him far faster than the
//             clip's feet travel: a roll, a dash)

/** Locomotion: the gait blend space (adapter.js). Speeds and cycles are read from the clips. */
export const LOCO = {
  idle: { want: 'idle', ch: 'MOVE Idle' },
  fightIdle: { want: 'swordIdle', use: ['idle'], ch: 'SWORD one-handed Idle' },
  gaits: [
    { want: 'walk', ch: 'MOVE Walk' },
    { want: 'run', ch: 'MOVE Run' },
    { want: 'sprint', ch: 'MOVE Sprint' },
  ],
  // the stops (from the gait he was in); played from the frame where the clip's own travel is over
  // (the game stops him far sooner than the footage's 0.8 m), so the settle shows, not a slide
  stop: { walk: { want: 'walkStop', use: ['runStop'] }, run: { want: 'runStop' }, sprint: { want: 'sprintStop', use: ['runStop'] }, ch: 'MOVE Walk / Run / Sprint to stop' },
  // a turn of more than this (rad) while standing plays the turn-in-place clip, once it exists
  turn: { want: 'turnInPlace', minAngle: 1.2, ch: 'MOVE Rotating in place' },
};

/**
 * Strafing: direction is the blend space's second axis. Until these clips exist the FORWARD gait plays
 * with the legs turned to the travel at the hips (up to 90 degrees; the chest keeps facing his aim) and
 * backward travel plays the forward cycle in reverse. Names the moveStrafe author should use: per gait
 * F (forward = the gait itself), B (backpedal), L, R (side steps to his left / right).
 */
export const STRAFE = {
  walk: { F: 'walk', B: 'strafeWalkB', L: 'strafeWalkL', R: 'strafeWalkR', ch: 'MOVE Strafe walk' },
  run: { F: 'run', B: 'strafeRunB', L: 'strafeRunL', R: 'strafeRunR', ch: 'MOVE Strafe run' },
  sprint: { F: 'sprint', B: 'strafeSprintB', L: 'strafeSprintL', R: 'strafeSprintR', ch: 'MOVE Strafe sprint' },
};

/** Attacks, by the game def's `name` (player/combat.js). */
export const ATTACKS = {
  // LIGHT[0..4]: the light chain
  fallingCut: { want: 'light1', how: 'attack', ch: 'SWORD Light attacks (5-hit combo) #1' },
  risingCut: { want: 'light2', use: ['light1'], how: 'attack', ch: 'SWORD Light attacks #2' },
  whirl: { want: 'light3', use: ['light1'], how: 'attack', ch: 'SWORD Light attacks #3' },
  stab: { want: 'light4', use: ['light2', 'light1'], how: 'attack', ch: 'SWORD Light attacks #4' },
  slam: { want: 'light5', use: ['light1'], how: 'attack', ch: 'SWORD Light attacks #5' },
  // HEAVY[0..4]: the heavy chain (the footage has two heavies; the game's last three repeat them)
  piercingGale: { want: 'heavy1', use: ['light2', 'light1'], how: 'attack', contact: 0.3, ch: 'SWORD Heavy attack (2-hit combo) #1' },
  risingCrescent: { want: 'heavy2', use: ['light2', 'light1'], how: 'attack', ch: 'SWORD Heavy attack #2' },
  whirlingTempest: { want: 'heavy1', use: ['light1'], how: 'attack', ch: 'SWORD Heavy attack #1 (again)' },
  mountainSplitter: { want: 'heavy2', use: ['light1'], how: 'attack', ch: 'SWORD Heavy attack #2 (again)' },
  earthbreaker: { want: 'jumpHeavy', use: ['heavy2', 'light1'], how: 'attack', ch: 'SWORD Jump heavy attack' },
  // out of a sprint, out of a roll
  sprintSlash: { want: 'runLight', use: ['light1'], how: 'attack', contact: 0.3, ch: 'SWORD Running light attack' },
  rollCut: { want: 'rollAtk', use: ['light2', 'light1'], how: 'attack', ch: 'SWORD Crouch attack / rolling attack' },
  // the charge's release, the execution, One Breath
  cleave: { want: 'charge1', use: ['light1'], how: 'attack', contact: 0.3, ch: 'SWORD Charge attack (2-hit combo) #1' },
  thrust: { want: 'riposte', use: ['light2', 'light1'], how: 'attack', ch: 'SWORD Critical hit / riposte, standing' },
  oneBreath: { want: 'guardCounter', use: ['light1'], how: 'attack', ch: 'SWORD One-handed guard counter' },
};
/** An attack def the table does not name: the light chain's first. */
export const ATTACK_DEFAULT = { want: 'light1', how: 'attack' };

/** The other states, by the animator key player.js plays (`_enter(state, key)`). */
export const STATES = {
  roll: { want: 'roll', how: 'roll', land: 61, contact: 0, ch: 'MOVE Dodge roll' },
  backstep: { want: 'backstep', how: 'roll', land: 23, contact: 0, ch: 'MOVE Backstep' },
  lean: { want: 'backstep', how: 'roll', land: 23, contact: 0, ch: 'MOVE Backstep (the Long Second)' },
  charge: { want: 'charge1', use: ['light1'], how: 'charge', coil: 0.3, ch: 'SWORD Charge attack #1 (held at the coil)' },
  heal: { want: 'flask', use: ['swordIdle', 'idle'], how: 'loop', ch: 'MOVE Using flasks' },
  block: { want: '2hGuard', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD Guarding stance (two-handed: the only guard filmed)' },
  parry: { want: 'guardCounter', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD One-handed guard counter' },
  bounce: { want: 'guardCounter', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD One-handed guard counter' },
  lock: { want: '2hGuard', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD Guarding stance' },
  stagger: { want: 'hitLight', use: ['backstep'], how: 'once', from: 2, rate: 1.4, contact: 0.5, ch: 'MOVE Hit by an enemy' },
  guardBreak: { want: 'hitStrong', use: ['backstep'], how: 'once', from: 0, rate: 1, contact: 0.5, ch: 'MOVE Getting hit by a strong attack' },
  knockdown: { want: 'hitStrong', use: ['roll'], how: 'once', from: 20, rate: 0.8, contact: 0, ch: 'MOVE Getting hit by a strong attack' },
  dead: { want: 'deathHit', use: ['roll'], how: 'hold', at: 40, contact: 0, ch: 'MOVE Death by an enemy' },
  deadDown: { want: 'deathHit', use: ['roll'], how: 'hold', at: 40, contact: 0, ch: 'MOVE Death by an enemy (on the ground)' },
  ghostep: { want: 'roll', how: 'roll', land: 61, contact: 0, ch: 'MOVE Dodge roll (a stand-in: not in the footage)' },
  plunge: { want: 'jumpHeavy', use: ['light1'], how: 'once', from: 0, rate: 1, contact: 0, ch: 'SWORD Jump heavy attack (a stand-in)' },
  flurry: { want: 'light1', use: ['light2'], how: 'once', from: 20, rate: 1.6, contact: 0, ch: 'SWORD Light attacks (a stand-in: not in the footage)' },
};
/** A key the table does not name: stand. */
export const STATE_DEFAULT = { want: 'swordIdle', use: ['idle'], how: 'loop' };

/** The first clip of an entry the library has (`want`, then `use` in order), or null. */
export function resolveClip(lib, entry) {
  if (!entry || !lib) return null;
  if (entry.want && lib.has(entry.want)) return lib.get(entry.want);
  for (const n of entry.use ?? []) if (lib.has(n)) return lib.get(n);
  return null;
}
