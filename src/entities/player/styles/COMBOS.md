# Writing a light combo for a style

Your style file (`styles/<id>.js`) gives the hero his default light attack: `chain` (the hits)
and `swings` (the clips they play). Leave `chain: null` and he swings today's five hits. Pick it in
play with `?combo=<id>` (or `?moves=<id>`), or in the Lab: PLAYER, then the `combo` row. The `look`
row under it pins one look of each hit. A switch takes effect when the next chain starts, never
partway through one.

## The pieces

**A hit (a "def")** has the shape of `LIGHT` in `combat.js`. Read the comments above `LIGHT` too.

| field | units | what it does |
|---|---|---|
| `name` | string | Unique across every style. Prefix it with your id (`flowRiver1`). The variant picker, the tests and the Lab key on it. |
| `combo` | 1..n | Its index + 1. The next hit is `chain[combo % length]`, so a wrong number skips hits. |
| `kind` | `'light'` / `'slam'` | `light`: one of the run. `slam`: a two-handed finisher (shards if it has `shards`, a heavy arc). Anything that is not `light` ends the chain. Never set `button`. |
| `damage`, `poise` | per hit | Raw damage and posture. |
| `heavy` | bool | A heavy blow: the arc's tone, the steel's flare, a world blow that bites stone. |
| `windup`, `active`, `recovery` | s | The clip's three phases (u 0-1, 1-2, 2-3). |
| `chain` | 0..1 | The share of the recovery after which the next press may start. **The next hit starts at `windup + active + chain × recovery`.** |
| `lunge`, `reach` | m | The step into the cut, and how far ahead it connects without stepping. The step-in assist stretches `lunge` by up to 1.3 m toward a target within 4.8 m. |
| `travel`, `keepYaw` | m, bool | Run momentum instead of a lunge (the sprint slash). |
| `hitstop`, `shake`, `punch`, `kick` | s, trauma, m, m | The weight of a landed hit (`HIT_FEEL`). `punch` / `kick` may be a number or `[k0, k1]`. |
| `bite` | 0..2 | How hard the edge catches: the hips drop, the chest folds, the blade holds (anim.js `BITE`). |
| `contact` | `'light'` `'sweep'` `'point'` `'slam'` `'cleave'` | The look of the cut drawn on the foe (cutFx.js `CUT_LOOK.tier`), and the cut sound's weight. |
| `glint: 'ridge'` | | For a point-first drive: the glint runs up the ridge, not an edge. |
| `up` | m | The reach band above the blade (2.6 by default; the slam uses 1.0). |
| `shards` | `{ radius, height }` | A slam's ground burst. |
| `reel` | 2 | Throws a duelist out of what he is doing. |
| `anim` | `{ kind: 'clip', clip, spin?, spinFeet?, turn?, hop?, tuck?, feet?, dashW? }` | Its look. The options are documented above `LIGHT`. |
| `variants` | `[anim, ...]` | More looks for the same hit, picked at random. Never the same look twice in a row, and never on the clip `line` the swing before it cut. |

**New levers.** Each one is off unless a def sets it.

| field | units | what it does |
|---|---|---|
| `hits` | `[{ at: [u0, u1], damage, poise, ...feel }]` | **More than one blow in one press.** Each window (`at`, in the clip's phase u: 1-2 is the active frames) tests the drawn blade afresh. Each landed window gets its own damage and posture, a fresh blow on the world, its own bite and arc glint, and its own swing sound: `player:attack` again with `window: i`, never eaten by the 40 ms sound gap. Any field of the def may be overridden per window (`hitstop`, `shake`, `punch`, `kick`, `bite`, `biteHold`, `contact`, `flare`, `heft`, `up`, `reel`; the edge glint's `glint` stays the def's). Without `hits`, the def has one blow in its active frames, as today. Windows are sorted; do not overlap them. Mapping u to seconds is linear per phase (anim.js `phaseTime`); the clip plays an eased curve, so check where the blade really is with the audit. |
| `heft` | `{ t: s ≤ 0.3, rate: 0.05..1 }` | After a landed hit's freeze, his own attack clock runs at `rate` for `t` s: the blade pushes through what it cut, then carries on. The root's step scales with it. `{ t: 0.08, rate: 0.35 }` costs about 0.05 s. |
| `biteHold` | s, 0.02..0.3 (default 0.08) | How long the bite holds the blade where it bit before it tears on. |
| `flare` | 0..1.5 (today 0.5 light / 0.75 heavy) | How far the steel flashes on a landed hit (`TUNE.bladeFlare.hit`). A crit keeps the heavy flash at least. |
| `buffer` | s (> 0.3) | A press made during this swing is kept this long (0.3 s otherwise). Set it on the hit that holds a long beat, so one early tap is not lost. |
| `branch` | 0..4 | The heavy a heavy press makes in this hit's recovery (HEAVY[n]). By default it is HEAVY[combo] up to the fourth light, then HEAVY[4]. After a hit that is not `light` it is HEAVY[0]. |

**The streak changes the moves.** Add `chainAwake: [{ minTier, chain }]` to the style. At the start
of a chain, the entry with the highest `minTier` at or under the streak's tier
(`streakTier(player.streak)`: 1 from 3 perfect defences, 2 from 5, 3 from 7, 4 from 10, 5 from 15)
replaces `chain`. Turning `?streakfx=` off or removing `tiers` turns this off. Its defs follow the
same rules and need their own unique names.

**A clip** is in the format of the header of `swings.js` (read it whole: keys over u, the coil key at
u = 1, the anticipation and overshoot keys, the whip, the free hand's rules). Put clips in your
style's `swings` under prefixed names. They join `SWINGS`, and every lint walks them. A name that is
already taken is left out, with a warning in the console. For the free hand's places, import `FH` from
`../swingKit.js`. **Never import `swings.js`, `combat.js` or anything that imports them** from a style
file: that is an import cycle (`swings.js` and `combat.js` import the styles).

## The rhythm: quick-quick-pause-BIG

The data alone sets the groove. Mashed, the next hit starts at `windup + active + chain × recovery`
of the one before. Mashing (or the phone's HOLD ATTACK, a press every 0.1 s) always has a press
waiting. The tests that walk a chain click every 0.36 s (`CHAIN_EVERY`), so keep every `next from`
of a light under about 0.36 s or tell the lead.

- **A quick hit:** windup 0.08-0.10, active 0.09-0.11, recovery 0.2, chain 0.15-0.25: the next hit comes about 0.23 s in.
- **A double in one press:** one def, active 0.16-0.2, `hits` with two windows (for example
  `[1.0, 1.45]` and `[1.45, 2.0]`). The clip sweeps through and back, or keeps cutting through both.
- **A held beat:** a hit whose `chain` is late (0.6-0.8) with a longer recovery (0.34-0.4), plus a
  `buffer` of 0.5-0.6 so an early tap waits. Add `heft` to make the hold read as weight, not lag.
- **A big finisher:** `kind: 'slam'` (or `'light'` to keep it one-handed), windup 0.22-0.3, active
  0.13-0.15, recovery 0.42-0.5, chain 0.3, `hitstop` 0.1-0.14, `bite` 1.3-1.5, `punch` 1.2-1.9,
  `heft`, `flare` 0.75-1.

**Damage per second stays where it is.** Today a mashed chain lands 194 damage in 1.80 s: 108/s by
the audit, about 104/s by the older measure in COMBAT.md. Keep yours within ±6 %. The audit prints
yours against today's.

## A worked skeleton (4 hits: quick, quick double, a held beat, a big finisher)

```js
import { FH } from '../swingKit.js'; // (only if a clip wants FH by hand; `fh: 'aim'` in a key works without it)
const chain = [
  { name: 'flowA1', kind: 'light', combo: 1, damage: 24, poise: 10, heavy: false,
    windup: 0.09, active: 0.1, recovery: 0.22, chain: 0.2, lunge: 0.5, reach: 2.2,
    hitstop: 0.05, shake: 0.1, bite: 1, contact: 'light', punch: 0.3, kick: 0.07,
    anim: { kind: 'clip', clip: 'flowA1' }, variants: [{ kind: 'clip', clip: 'flowA1b' }] },
  { name: 'flowA2', kind: 'light', combo: 2, damage: 30, poise: 12, heavy: false,
    windup: 0.09, active: 0.16, recovery: 0.24, chain: 0.2, lunge: 0.55, reach: 2.2,
    hitstop: 0.045, shake: 0.1, bite: 0.8, contact: 'light', punch: 0.3, kick: 0.07,
    hits: [{ at: [1.0, 1.45], damage: 14 }, { at: [1.45, 2.0], damage: 16, hitstop: 0.06 }],
    anim: { kind: 'clip', clip: 'flowA2' } },
  { name: 'flowA3', kind: 'light', combo: 3, damage: 34, poise: 16, heavy: false,
    windup: 0.12, active: 0.12, recovery: 0.36, chain: 0.75, buffer: 0.6, lunge: 0.6, reach: 2.2,
    hitstop: 0.07, shake: 0.16, bite: 1.2, biteHold: 0.12, heft: { t: 0.08, rate: 0.35 },
    contact: 'sweep', punch: 0.5, kick: 0.1, anim: { kind: 'clip', clip: 'flowA3', turn: -0.3 } },
  { name: 'flowA4', kind: 'slam', combo: 4, damage: 80, poise: 44, heavy: true,
    windup: 0.26, active: 0.14, recovery: 0.44, chain: 0.3, lunge: 0.75, reach: 2.1,
    hitstop: 0.12, shake: 0.42, bite: 1.4, heft: { t: 0.1, rate: 0.3 }, flare: 0.9,
    contact: 'slam', punch: 1.6, kick: 0.2, up: 1.0, shards: { radius: 1.7, height: 3.2 },
    anim: { kind: 'clip', clip: 'flowA4' } },
];
// next from: 0.234 · 0.298 · 0.51 · 0.532 s → a cycle of ~1.6 s, 168 damage → ~105 /s (check: the audit)
export const flow = { id: 'flow', /* ... */ chain, swings: { flowA1: { line: 'right', keys: [/* ... */] }, /* ... */ } };
```

## The rules a clip must pass (the suites lint every clip in SWINGS, yours too)

- **Diagonals** (HEROLIFE): through the active frames the blade stays under 50° of elevation in every
  key, and within 20° of level in the key where it points most nearly ahead (if that key is within 45°
  of ahead). A thrust (`line: 'point'`) has no plane.
- **The whip** (HEROLIFE): the blade key nearest u 1.5 hangs 20-45° short of pointing ahead (`a[0]`).
  Clips with `two: 1` keys are not held to it. Only the clips named `whirl` / `risingWhirl` are exempt,
  **by name**. A spin of your own must either pass, or have no blade key within 0.06 of u 1.5 (the
  lint skips it then), or get an exemption.
- **Thrusts rise** (HEROLIFE): a `line: 'point'` clip's point is ≥ 30° above level at full reach (u 1.5-2).
- **The stance** (HEROWEIGHT): `fy` yaws ≤ 1 rad, `lF` ahead (z > 0) and `rF` behind (z < 0).
- **A `line`** on every clip, so the picker keeps two hits in a row off one plane.
- The one-handed lights of today are also held to an anticipation key (u 0.5-0.8, body only, hips
  ≥ 0.06 and chest ≥ 0.04 rad past the coil, away from the cut) and an overshoot key (u 2.05-2.25, hips
  ≥ 0.06 rad past the finish, 0.025 for a thrust, settling back). Yours are not linted for these in
  the suites, but the audit holds you to them: they are what makes a cut read as powered by the body.
- In play: the blade must cross his front **inside the active frames** (near the middle: a cut that
  crosses early swings past before the step-in closes the gap and misses at 3-3.5 m), no arm segment
  may turn more than 60° in a frame (ELBOW_RATE, 14 rad/s, lags a big elbow change in a short cut:
  key it in the windup), and the toe may drag at most 12 cm a swing.

To be exempted from a rule, ask the lead (it is the owner's call). Never loosen a test's bound.

## The audit

```
node tests/audit/hero-combo.mjs . <styleId>
```

The audit runs your chain (and every `chainAwake` chain) against the wyrm with the suites' harness and
prints:
- per hit: W / A / R, when the next hit may start, damage, looks and windows;
- the mashed cadence and damage per second against today's (PASS within ±6 %);
- every look of every hit, one press at a time, at 2.0 / 2.75 / 3.5 m: hit or MISS;
- per look:
  - where the blade crosses his front (PASS inside the active frames);
  - the fastest frame of each arm segment (PASS < 60°), the hands, the blade's point and the head;
  - the elbows' range;
  - the feet sliding on the grass (PASS ≤ 12 cm);
  - the hips' lead over the hand (PASS ≥ 1 frame);
  - the blade vs his torso, hips and head;
- the clip lint, pass or fail per clip.

It takes 10-20 s and exits 0 whatever it finds. Run the suites as well:
`node tests/integration/integ.mjs . herolife,herolook,herohand,heroweight,herocombo`.

## Traps

- Names: a def `name` or a clip name shared with another style breaks the variant picker's memory and
  the Lab, and a duplicate clip is left out. Prefix both with your style id.
- `combo` must equal index + 1.
- A def's `kind` other than `'light'` ends the chain. A heavy press after it gives HEAVY[0].
- `hits` windows replace the active frames as the hit test. Every window must contain a moment where the
  blade crosses something in front of him. A window in the recovery is allowed, but the trade check
  and the cutting-bullets check run to the last window's end.
- The swing sound plays when the swing starts (and again at each window past the first), not at the
  contact. A long windup sounds early.
- The streak's chain is read only at a chain's start. A tier reached mid-chain shows on the next chain.
- `heft` slows his clock, not the world's. Too much of it reads as lag, not weight; stay under 0.12 s.
- Do not use `Math.random` anywhere in a style. The animator picks variants with its own noise.
- Keep the defs plain data (no functions).
