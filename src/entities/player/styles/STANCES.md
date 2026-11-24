# Writing a style's stances and idle actions

For the authors of `styles/<id>.js`. The contract is in `styles/index.js`. This page covers how the
engine reads `stances`, `shift` and `fidgets`, the helpers you write them with, the switches, the audit,
and the traps. With `stances: null` / `fidgets: null` the hero is exactly today's (the `herostyles`
test holds him to it frame by frame).

## What the engine does with your data
- **Two sets.** `ease` is nothing to fight. `fight` means locked on, or a boss fight (`bossIntro` /
  `boss`), or the Lab's "fight". They blend by `anim.fightW` (in over ~0.4 s, out over ~0.9 s), as today.
- **One stance at a time per set.** The animator holds the current STANCE for a random `dwell`
  (seconds, `[min, max]`, counted from the end of the fade into it). Then it picks another by `w`
  (weight; 0 = never picked by chance, only by a pin), never the same one twice running, and
  cross-fades to it over `shift.fade` seconds (default 1.2, smootherstep). A list of one never moves.
- **When a shift may start.** Only in the loco clip, with no idle action playing and no guard held:
  never mid-attack. He may be walking. A dwell that ran out waits. A fade always runs to its end;
  anything that wants a new stance (a pin, a style switch, a streak tier) waits for it, so nothing pops.
- **Streak tiers.** `minTier` / `maxTier` (0..5; `streakTier(player.streak)`, combat/streak.js). A stance
  outside its range is left at once, after a running fade. If the held one is the only stance in
  range, he stays in it. If none is in range, all may play. Your pose functions can read `A.streakTier`
  (0..5) and `A.streakK` (0..1, tier / 5, smoothed at 3/s) to change how he holds the sword as the
  streak grows.
- **Setting off.** The gait blends over whatever stance he is in: the feet step (the foot planner), the
  sword arm trails or keeps the guard up (`FIGHT_RUN`), the free arm swings and its hand opens (`hs` → 0
  over the first fifth of a stride). As he sets off, the fingers and palm are pulled toward
  `STANCE.move = { d, n }` (unit vectors, body axes). Without `move` they go to today's
  `REST_LD / REST_LN` (ahead and down); with `move: false` the stance's own hand is kept.

## A STANCE
```js
import { atEase } from '../stances.js'; // today's two, if you want to start from one
import { P, set3, dir, handLoose, handFingers, standLife, wave } from '../poseKit.js';

const highGuard = {
  id: 'flow.high',            // unique in the set (the Lab's pose buttons show it)
  w: 1,                       // weight
  dwell: [7, 14],             // seconds held (after its fade)
  minTier: 0, maxTier: 5,     // optional
  move: { d: [0, -0.6, 0.8], n: [-0.6, -0.2, -0.7] }, // optional (see above)
  fn(p, P, A) {               // p already holds guard()'s pose: write a WHOLE standing pose over it
    const m = standLife(A.time, 3.4);   // the slow sines (see the kit)
    p[P.bodyX] = -0.02 * m.sw; p[P.bodyY] = -0.03 + 0.007 * m.br; p[P.bodyZ] = 0;
    p[P.pelvX] = 0; p[P.pelvY] = -0.2; p[P.pelvZ] = -0.03 * m.sw;
    p[P.spX] = 0.02 * m.br; p[P.spY] = 0.12; p[P.spZ] = 0.03;
    p[P.hdX] = 0.02; p[P.hdY] = 0.15 + 0.15 * m.look; p[P.hdZ] = 0;
    set3(p, P.rH, -0.17, -0.46 + 0.01 * m.brL, 0.06);  // the sword hand (from its shoulder)
    set3(p, P.rP, 0.55, -0.25, -0.8);                    // the sword elbow's side
    dir(p, P.swD, -60 + 3 * m.tipA, -50 + 2 * m.tipB);   // the blade (az, el in degrees)
    set3(p, P.swF, 0.6, 0, 0.8);                         // the flat's normal
    handLoose(p, m);                                     // the free hand (or write lH / lP / lD / lN / hs)
    set3(p, P.rF, -0.14, 0.07, -0.08); set3(p, P.lF, 0.13, 0.07, 0.15); // feet (model space, y = ankle)
    set3(p, P.rK, -0.5, 0.05, 1); set3(p, P.lK, 0.2, 0.05, 1);          // knee sides
    p[P.rFy] = -0.6; p[P.lFy] = 0.12; p[P.footFlat] = 0.95;
  },
};
export const flow = { /* … */ stances: { ease: [highGuard /* , … */], fight: [/* … */] }, shift: { fade: 1.4 } };
```
Write every channel `atEase` writes (stances.js), so a cross-fade or the blend into the other set never
leaves one of today's values behind: `bodyX/Y/Z pelvX/Y/Z spX/Y/Z hdX/Y/Z rH rP swD swF`, the free hand
(`lH lP lD lN hs lk twoHand offAt`; one of the kit's rests writes all eight), `rF lF rK lK rFy lFy
footFlat`. Nothing in `fn` may allocate, throw or use `Math.random`; it runs several times a frame (the
loco, an attack's way home, the legs of a block).

## The channels in plain words (body axes: x = his LEFT, y up, z AHEAD)
| channel | what | units |
|---|---|---|
| `bodyX/Y/Z` | the waist pivot's offset (Y: − = he sinks into his knees) | m |
| `pelvY / pelvZ / pelvX` | hips: turn (+ faces them toward his left, the right hip forward; atEase −0.24 = the left hip ahead), tilt, tuck | rad |
| `spY / spZ / spX` | the chest on the hips: turn, side lean, bow (+ forward) | rad |
| `hdY / hdZ / hdX` | the head on the chest: turn, tilt, nod (+ down) | rad |
| `rH` / `lH` | the sword hand / the free hand: offset from its shoulder (reach ≈ 0.55; the arm eases off near it) | m |
| `rP` / `lP` | the side each elbow points to (a direction; the solver turns it ≤ 14 rad/s) | dir |
| `swD` / `swF` | the blade's direction / its flat's normal (keep the flat broad to a camera behind and above him) | dir |
| `lD` / `lN` | the free hand's fingers / palm (LENGTH = weight: 0 = rigid on the forearm) | dir |
| `hs` / `lk` | the free hand's shape (0 open, 1 sword fingers; it switches at 0.6 / 0.4) / resting on the sword wrist (0..1) | 0..1 |
| `twoHand` / `offAt` | the free hand on the grip / how far up the blade | 0..1 / m |
| `rF` / `lF`, `rFy` / `lFy` | feet (MODEL space: y = 0.07 flat), their toe-out yaw | m / rad |
| `rK` / `lK`, `footFlat` | the knees' side, how flat the feet sit | dir / 0..1 |
`yaw`, `pitch`, `roll` (the whole body) are the clips' own. Leave them at 0 in a stance.

## An idle action (`fidgets`)
`{ name, dur, sets: ['ease'] | ['fight'] | ['ease', 'fight'], fn(p, A, u, e) }`. `u` is its time (0..1)
and `e` its weight (0 → 1 → 0 through a 0.45 s fade in and a 0.55 s fade out). It plays after 2.5 s
standing still, then every 2-4.5 s; any move, attack, guard or other clip cuts it within 0.16 s. With no
`sets` it plays at ease only. In `fight` it plays only when he is fully in the guard and standing.
Write it as an OFFSET from the pose already in `p` (your stance, whichever of the set he holds), never
as an absolute target, so it reads from every stance:
```js
{ name: 'flow.flick', dur: 2.2, sets: ['ease', 'fight'], fn(p, A, u, e) {
  const b = hump(u, 0.15, 0.3, 0.6, 0.85);             // 0 → 1 → 0 within the action
  dirNudge(p, P.swD, 25 * b, 15 * b, e);                // turn the blade 25° left, 15° up from where it is
  add3(p, P.rH, 0, 0.04 * b, 0.05 * b, e);              // the hand a little up and ahead
  p[P.hdY] += 0.3 * kf(u, [0.1, 0, 0.3, 1, 0.7, 1, 0.9, 0]) * e; // the head follows it
} }
```
If you set an absolute target, `to3(p, i, x, y, z, e)` blends toward it by the weight.

## The kit (`poseKit.js`; no import of anim.js, so there is no cycle)
- `P`, `N`, `ANK`
- `v3` / `set3` set a vector; `to3(p, i, x, y, z, t)` moves one toward a target by `t`; `add3(p, i, x, y, z, e)` offsets one
- `dir(p, i, az, el)` and `unitAzEl(az, el)` turn degrees into a direction; `turnY(p, i, a)` turns about the vertical
- `dirLerp`, `dirTo(p, i, x, y, z, t)` blend directions round the OUTSIDE of the body (a low blade never
  sweeps through the legs); `dirNudge(p, i, dAz, dEl, e)` turns by an offset
- `kf(t, keys)` (smoothstepped keys `[t0, v0, t1, v1…]`), `hump(u, a, b, c, d)`, `smoother(x)`
- `standLife(t, breath, L?, out?)` returns `{ br, brL, sw, dr, look, tipA, tipB }`, each −1..1: breath, the
  arms' late breath, weight foot to foot, slow drift, a wandering gaze, the point's two. Periods
  `STAND_LIFE` (none a multiple of another; pass your own `L` in its shape). `wave(t, period, phase)` is
  one sine.
- Free-hand rests (each writes `lH lP lD lN hs lk twoHand offAt`):
  - `handLoose(p, m, { out, fwd, swing })`: hangs beside the thigh, open (audited: 7 cm off the hips,
    elbow 128-136°)
  - `handFingers(p, m, { at: 'chest' | 'low' })`: sword fingers raised before the chest / low ahead of
    the hip (17-18 cm clear, elbow 83-127°)
  - `handBelt(p, m, yaw)`: today's
  - `freeLimp(p, k)`
- `REST_LD`, `REST_LN`, `BELT`

## Switches, pins, the Lab
- `?stance=<id>` (stand + idle only), `?moves=<id>`; at run time `setStanceStyle(id)` (styles/index.js).
  The switch cross-fades.
- `player.debug.stance = { ease: id | null, fight: id | null }` pins a pose (it waits for a running
  fade). `player.debug.fightStance = true | false | null` holds a set.
- `player.anim.debug.fidget(name)` starts an idle action now (the style's list, then today's), in
  either set.
- Lab → PLAYER: `stance` (auto / at ease / fight), then `moves: stand` (the five styles), `pose` (auto
  + each pose of each set) and `fidget` (each idle action of the style).
- Read-outs: `anim.stanceSel.ease / .fight` gives `{ cur, prev, k (fade 0..1), t, dwell, n (shifts) }`;
  `anim.fidget` gives `{ k, name, w, set }`; also `anim.streakTier` and `anim.streakK`.

## The audit (run it before you send)
`node tests/audit/hero-stance.mjs . <styleId> [--quick]` (about 15 s, `--quick` less). It covers every
pose pinned (6 s standing, then four facings), every cross-fade pair, every idle action in each set,
and out of each pose: run / strafe / backpedal starts and stops, a light, a block, a roll and a drink.
Its table gives:
- the sword-wrist kink, elbows and knees
- the free hand into waist / hips / hood / sword forearm
- the blade's gap to body / hood / legs, and coat crossings
- the flat vs the game camera
- the point's height
- the fastest frame of the grip / point / free hand / head / elbows / feet (with WHERE)
- segment turns, and steps

Rows past the suites' bounds are flagged with what to move. Run `today` too: a few flags are today's
own (the blade's flat at ease 0.22 from one side, the light's whip, the block's entry, the drink in the
guard). Then film it at the game camera (the brief's rig). The owner judges by eye, not by the table.

## Traps
1. Several calls a frame: `fn` must be a pure function of `A` (its `time`, `streakK`, …). No timers or
   noise in it; keep state on your own module only if it is frame-stable.
2. Today's tests pin the belt hand (HEROSTANCE S2 / S5, HEROARMS A1, HEROLIFE "at rest open, `hs` <
   0.1", HEROHAND H11). They run on `today`, so your style does not touch them. If the owner picks your
   style as the default, those bounds move with the owner's pick (the lead's call).
3. The free hand is only kept out of the ribs (shoulder down 0.5 m). Below that, the waist and hips are
   guarded by nothing but the audit (≤ 1.5 cm).
4. Sword fingers (`hs` 1) open as he sets off. They switch at 0.4 / 0.6, once. Give the stance `move`
   so the fingers go where its hand goes.
5. A fight stance is every attack's starting pose. Its hips and chest change how the first frames of a
   swing read (the light's windup, `SW_LEAD_FAR`), so run the light row and watch the chain in play.
6. Feet more than 0.1 m from the last stance's feet make the planner STEP (one foot at a time). That is
   good in a shift and bad in a fidget: do not write feet in idle actions.
7. Today's six idle actions are absolute targets written for the belt-hand base. They tear the hand
   off any other rest. Bring your own `fidgets`, written as offsets.
8. The cloak and coat: a free hand out to the side meets cloak sheets on other outfits (LOOKS: ≤ 2 %
   of frames within 6 cm). Check `?heroLook=` other than today's.
9. The blade near the legs is bent out by the solver (`_bladeClear`) without a word. The kink stays
   fine but the pose looks wrong. Keep ≥ 8 cm of gap in a held pose (the audit flags it).
10. Keep the flat broad to the camera from all four sides (≥ 0.25-0.3). A blade pointed at the camera
    is drawn straight down into the grass; one edge-on vanishes.
11. No `Math.random` anywhere (the sims seed it), and no new scene objects on the default rig.
