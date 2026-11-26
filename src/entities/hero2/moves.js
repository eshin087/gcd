// The remade hero's move table (`?hero=new`, adapter.js): which recorded clip each game move plays.
// ONE data file. Every entry names the clip it WANTS (the name its set's author gives it, from the
// footage's chapter) and the clips it falls back to until that set is built; the adapter plays the first
// one the registry has. No combat number lives here: attacks are fitted to their game defs
// (player/combat.js windup / active / recovery) by fit.js, the rest to the game's own durations (the
// `knots` below name them; adapter.js reads them from the player and its TUNE).
//
//   want      the clip that will play once its set is built (CATALOG chapter in `ch`)
//   use       fallbacks, in order, from clips that exist today
//   how       'attack'  fitted to the def's windup / active / recovery (the attack clock, atk.t)
//             'charge'  the coil reached in `coil` s, then held while the button is held
//             'roll'    the clip's flight fitted to the roll's: its `land` EVENT lands on the game's landAt
//             'track'   the clip's frames pinned to the game's clock by `knots`: [gameTime, frame] pairs,
//                       straight between them; gameTime a number (s since the state began) or the name
//                       of a game duration ('stagger' the stagger's length, 'guardBreak' the stumble
//                       before the knockdown, 'knockdown' its length, 'getUp' when its get-up i-frames
//                       begin), a frame a number or 'cur' (the frame the same clip already stands at, so a
//                       state that carries on the same clip does not restart it). After the last knot the
//                       clip runs on at `tail` x real speed (0: holds there) to its last frame, held.
//                       `settle`: when the game lets him go (back to standing) with no input, the clip
//                       plays on at that speed to its end before he stands (a get-up, a stagger's recovery)
//             'loop'    looped
//             'hold'    frame `at` held (a still stand-in)
//   contact   0..1: how much its planted feet are pinned (0 where the game moves him far faster than the
//             clip's feet travel: a roll, a dash)

/**
 * Locomotion (adapter.js). Speeds and cycles are read from the clips (each loop's `speed`, its plants).
 * A sector of the travel direction RELATIVE TO HIS FACING picks the loops (F forward, L / R side steps to
 * his left / right, B backpedal; the legs turn the rest of the way at the hips, at most `legMax` rad),
 * the speed mixes the pair round it. The game's run (4.6 m/s) is faster than the footage's (4.4) and its
 * strafe (the same 4.6) far faster than the footage's side steps (2.8): a loop plays at most `rateMax`
 * x its own cadence, the planted feet's pin stretches the stride the rest.
 */
export const LOCO = {
  idle: { want: 'idle', ch: 'MOVE Idle' },
  fightIdle: { want: 'swordIdle', use: ['idle'], ch: 'SWORD one-handed Idle' },
  sectors: {
    F: [{ want: 'walk' }, { want: 'run' }, { want: 'sprint' }],
    L: [{ want: 'strafeWalkL' }, { want: 'strafeRunL' }],
    R: [{ want: 'strafeWalkR' }, { want: 'strafeRunR' }],
    B: [{ want: 'strafeWalkB' }, { want: 'strafeRunB' }],
    ch: 'MOVE Walk / Run / Sprint, MOVE Strafe walk / run (L, R, B)',
  },
  // a strafe SPRINT: there is none in the footage (he turns his whole body and runs): the game faces him
  // along the travel while he sprints, so it is the plain sprint (sector F)
  legMax: 0.9, // rad: the legs' turn at the hips inside a sector (the sector edges are at 50 / 130 deg)
  rateMax: 1.75, // the most a strafe loop's cadence is sped up (the plain gaits: uncapped)
  // starts from standing, by the speed he sets off to; played by DISTANCE (the clip's own travel matched
  // to the game's, at 1 to `rateMax` x real speed), then handed to the loop at the matching phase
  // (its weight shift in place, the first `skip` m of its travel, is skipped: the game is at speed in a
  // fifth of a second)
  start: { walk: { want: 'walkStart' }, run: { want: 'runStart' }, sprint: { want: 'sprintStart', use: ['runStart'] }, skip: 0.06, rateMax: 4.5, ch: 'MOVE Walk / Run / Sprint start' },
  // stops (from the gait he was in), each with its other-foot variant: the one whose legs match his
  // pose when the input ends plays. Entered where the clip's remaining travel is the game's remaining
  // slide (at least `minLeft` m: the last step), played by distance, then at real speed to the settle. A clip that travels under `minTravel` m
  // forward (a measurement fault) is passed over for the next
  stop: {
    walk: { want: ['walkStop', 'walkStopL'] },
    run: { want: ['runStop', 'runStopL'] },
    sprint: { want: ['sprintStop', 'sprintStopL'], use: ['runStop', 'runStopL'] },
    minTravel: 0.4,
    minLeft: 0.3,
    ch: 'MOVE Walk / Run / Sprint to stop',
  },
  // the input reverses at speed (the new travel more than `minAngle` rad off the old, and he will face
  // it): the pivot (the footage has none for the sprint: the run's). Its root yaw carries the turn: the
  // body is drawn at (yaw at the start + the clip's root yaw), the game's yaw catches up meanwhile
  pivot: { walk: { want: 'walkPivot' }, run: { want: 'runPivot' }, sprint: { want: 'runPivot' }, minAngle: 2.4, minSpeed: 1.2, from: 8, rate: 1.6, out: 36, ch: 'MOVE Walk / Run pivot' },
  // standing, the aim turns more than `minAngle` rad: the turn on the spot (90 or 180 by the size), its
  // root yaw drawn as the pivot's
  turn: {
    L90: { want: 'turnL90' }, R90: { want: 'turnR90' }, L180: { want: 'turnL180' }, R180: { want: 'turnR180' },
    minAngle: 1.05, big: 2.36, from: 8, rate: 1.6,
    ch: 'MOVE Rotating in place',
  },
};

/** Attacks, by the game def's `name` (player/combat.js). */
export const ATTACKS = {
  // LIGHT[0..4]: the light chain
  // (built facing their target: `aim: 0`, no measured turn; `recover`: the return to the guard when the
  // chain stops at that swing and he stands)
  fallingCut: { want: 'light1', how: 'attack', aim: 0, recover: 'lightRecover1', ch: 'SWORD Light attacks (5-hit combo) #1' },
  risingCut: { want: 'light2', use: ['light1'], how: 'attack', aim: 0, recover: 'lightRecover2', ch: 'SWORD Light attacks #2' },
  whirl: { want: 'light3', use: ['light1'], how: 'attack', aim: 0, recover: 'lightRecover3', ch: 'SWORD Light attacks #3' },
  stab: { want: 'light4', use: ['light2', 'light1'], how: 'attack', aim: 0, recover: 'lightRecover4', ch: 'SWORD Light attacks #4' },
  slam: { want: 'light5', use: ['light1'], how: 'attack', aim: 0, recover: 'lightRecover5', ch: 'SWORD Light attacks #5' },
  // HEAVY[0..4]: the heavy chain (the footage has two heavies; the game's last three repeat them)
  piercingGale: { want: 'heavy1', use: ['light2', 'light1'], how: 'attack', contact: 0.3, recover: 'heavyRecover1', ch: 'SWORD Heavy attack (2-hit combo) #1' },
  risingCrescent: { want: 'heavy2', use: ['light2', 'light1'], how: 'attack', recover: 'heavyRecover2', ch: 'SWORD Heavy attack #2' },
  whirlingTempest: { want: 'heavy1', use: ['light1'], how: 'attack', recover: 'heavyRecover1', ch: 'SWORD Heavy attack #1 (again)' },
  mountainSplitter: { want: 'heavy2', use: ['light1'], how: 'attack', recover: 'heavyRecover2', ch: 'SWORD Heavy attack #2 (again)' },
  earthbreaker: { want: 'jumpHeavy', use: ['heavy2', 'light1'], how: 'attack', ch: 'SWORD Jump heavy attack' },
  // out of a sprint, out of a roll
  sprintSlash: { want: 'runLight', use: ['light1'], how: 'attack', aim: 0, contact: 0.3, ch: 'SWORD Running light attack' },
  rollCut: { want: 'rollAtk', use: ['light2', 'light1'], how: 'attack', aim: 0, ch: 'SWORD Crouch attack / rolling attack' },
  // the charge's release, the execution, One Breath
  cleave: { want: 'charge1', use: ['light1'], how: 'attack', contact: 0.3, ch: 'SWORD Charge attack (2-hit combo) #1' },
  thrust: { want: 'riposte', use: ['light2', 'light1'], how: 'attack', aim: 0, ch: 'SWORD Critical hit / riposte, standing' },
  oneBreath: { want: 'guardCounter', use: ['light1'], how: 'attack', aim: 0, ch: 'SWORD One-handed guard counter' },
};
/** An attack def the table does not name: the light chain's first. */
export const ATTACK_DEFAULT = { want: 'light1', how: 'attack' };

/**
 * The dodge roll by its direction RELATIVE TO HIS AIM (locked on: the game turns him to the roll, the
 * remade hero keeps facing the target and rolls that way: the side and back rolls' root faces his aim
 * while they travel). Without a lock target it is always the forward roll. A missing one: the roll,
 * turned to the travel.
 */
export const ROLLS = {
  F: { want: 'roll' },
  L: { want: 'rollL', use: ['roll'] },
  R: { want: 'rollR', use: ['roll'] },
  B: { want: 'rollB', use: ['roll'] },
  ch: 'MOVE Dodge roll (forward / left / right / back)',
};

/** The flask (adapter.js): an upper-body layer over the legs' locomotion (he may walk while drinking,
 *  TUNE.healSpeed). Its frames are pinned to the drink's clock (`knots`: the flask at his mouth when the
 *  heal lands, TUNE.heal.at); `flaskEmpty` when he has none left (player:noFlask), at `emptyRate`. The
 *  clips' left hand holds the flask (their props.L); the sword stays in the right. */
export const HEAL = {
  drink: { want: 'flask', knots: [[0, 10], [0.5, 40], ['heal', 64]], tail: 1.2, ch: 'MOVE Using flasks' },
  empty: { want: 'flaskEmpty', from: 6, rate: 1.5, ch: 'MOVE Using flasks (none left)' },
};

/** The other states, by the animator key player.js plays (`_enter(state, key)`). */
export const STATES = {
  roll: { want: 'roll', how: 'roll', dir: true, contact: 0, ch: 'MOVE Dodge roll' },
  backstep: { want: 'backstep', how: 'roll', contact: 0, ch: 'MOVE Backstep' },
  lean: { want: 'backstep', how: 'roll', contact: 0, ch: 'MOVE Backstep (the Long Second)' },
  // (the coil: its `holdStart` event, when it has one)
  charge: { want: 'charge1', use: ['light1'], how: 'charge', coil: 0.3, ch: 'SWORD Charge attack #1 (held at the coil)' },
  heal: { how: 'heal', ch: 'MOVE Using flasks (HEAL above)' },
  block: { want: '2hGuard', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD Guarding stance (two-handed: the only guard filmed)' },
  parry: { want: 'guardCounter', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD One-handed guard counter' },
  bounce: { want: 'guardCounter', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD One-handed guard counter' },
  lock: { want: '2hGuard', use: ['swordIdle', 'idle'], how: 'loop', ch: 'SWORD Guarding stance' },
  // the flinch: its recoil (frames 2..28) in the stagger's length, the recovery after it if he stands
  stagger: { want: 'hitLight', use: ['backstep'], how: 'track', knots: [[0, 2], ['stagger', 28]], tail: 1, settle: 1.3, contact: 0.5, ch: 'MOVE Hit by an enemy' },
  // the guard broken: the strong hit's stumble (frames 0..9, before he leaves the ground) in the game's
  // stumble (the guard-open stagger, or the guard break's run-up to the knockdown, which carries it on)
  guardBreak: { want: 'hitStrong', use: ['hitLight'], how: 'track', knots: [[0, 0], ['guardBreak', 9]], tail: 0, contact: 0.5, ch: 'MOVE Getting hit by a strong attack (the stumble)' },
  // thrown down: the fall onto his back lands when the game's dust does (0.3 s, frame 17: the hips on
  // the ground), he lies (16..78) until the get-up's i-frames, the get-up (78..112) in what is left; the
  // rest of it after, if he stands
  knockdown: { want: 'hitStrong', use: ['roll'], how: 'track', knots: [[0, 'cur'], [0.3, 17], ['getUp', 78], ['knockdown', 112]], tail: 1, settle: 1.4, contact: 0.3, ch: 'MOVE Getting hit by a strong attack' },
  // killed: down by 0.9 s (the footage's own fall is 0.55 s; the game's dust lands at 1.38), lying held
  dead: { want: 'deathHit', use: ['roll'], how: 'track', knots: [[0, 0], [0.9, 16]], tail: 1, contact: 0.3, ch: 'MOVE Death by an enemy' },
  // killed out of the air (the plunge, a fall): the fall's death
  deadAir: { want: 'deathFall', use: ['deathHit', 'roll'], how: 'track', knots: [[0, 0], [0.5, 14]], tail: 1, contact: 0.3, ch: 'MOVE Death by falling' },
  // killed where he lay (in the knockdown): he stays down (the strong hit's lying frames, held)
  deadDown: { want: 'hitStrong', use: ['deathHit', 'roll'], how: 'track', knots: [[0, 'cur'], [0.35, 60]], tail: 0, contact: 0.3, ch: 'MOVE Death by an enemy (on the ground)' },
  ghostep: { want: 'roll', how: 'roll', contact: 0, ch: 'MOVE Dodge roll (a stand-in: not in the footage)' },
  plunge: { want: 'jumpHeavy', use: ['light1'], how: 'once', from: 0, rate: 1, contact: 0, ch: 'SWORD Jump heavy attack (a stand-in)' },
  flurry: { want: 'light1', use: ['light2'], how: 'once', from: 20, rate: 1.6, contact: 0, ch: 'SWORD Light attacks (a stand-in: not in the footage)' },
};
/** A key the table does not name: stand. */
export const STATE_DEFAULT = { want: 'swordIdle', use: ['idle'], how: 'loop' };

/** The first clip of an entry the library has (`want` (a name, or a list), then `use` in order), or null.
 *  `ok(clip)`: an optional test a clip must pass to be taken. */
export function resolveClip(lib, entry, ok = null) {
  if (!entry || !lib) return null;
  for (const n of [...[entry.want].flat(), ...(entry.use ?? [])]) if (n && lib.has(n) && (!ok || ok(lib.get(n)))) return lib.get(n);
  return null;
}

/** Every clip of an entry the library has (`want` then `use`), in order (the stop's foot variants). */
export function resolveAll(lib, entry, ok = null) {
  if (!entry || !lib) return [];
  const r = [];
  for (const n of [...[entry.want].flat(), ...(entry.use ?? [])]) if (n && lib.has(n) && (!ok || ok(lib.get(n))) && !r.includes(lib.get(n))) r.push(lib.get(n));
  return r;
}
