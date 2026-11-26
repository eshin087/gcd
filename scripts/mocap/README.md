# scripts/mocap: clips for hero2 measured from the owner's reference footage

The remade hero (`src/entities/hero2/`, `?hero=new`) plays RECORDED clips. This folder is the offline tool
that makes them: it tracks the character in the owner's reference footage (the MOVE film and the SWORD
film), fuses the camera angles of each move, retargets the motion onto our skeleton (`skeleton.js`,
`dims.js`), cleans it and writes a clip-set module (`src/entities/hero2/clips/<set>.js`, format in
`src/entities/hero2/README.md`). Motion is measured, not invented: when your taste and the footage
disagree, the footage wins.

Never name the reference's game, character or studio anywhere (code, specs, commits). Never commit a
reference frame or a picture made from one: frames, caches and sheets live in the work folder only.

## Setup

```bash
PY="E:/Vibe Coding/.claude-temp/claude/148948b5eaa20cf5/4b3d9810-4084-4115-b2cf-affa2f976f74/scratchpad/pose/Scripts/python"
H2="E:/Vibe Coding/.claude-temp/claude/148948b5eaa20cf5/4b3d9810-4084-4115-b2cf-affa2f976f74/scratchpad/h2"
cd "<your worktree>/scripts/mocap"
```

Always run Python as `"$PY" -I <script>`. Folders (environment variables, defaults in `mlib/cfg.py`):
`MOCAP_REF` the frames (`<film>/t<seconds>.jpg`), `MOCAP_WORK` the work folder (`$H2/mocap`: `cache/`
tracked landmarks, `built/` per-clip results and `build.log`, `sheets/` pair sheets, `shots/` take sheets).

## The commands, for one new clip

1. **Find the takes.** Track the chapter (HEAVY: under the lock, under 8 minutes; it resumes where it
   stopped, so run it again until it prints `0 frames left`), then list its take candidates:
   ```bash
   bash "$H2/lock.sh" <you> "$PY" -I track.py move 168 189          # film, chapter start, end (s)
   "$PY" -I shots.py move 168 189                                   # light
   ```
   `shots.py` prints `take k: t0-t1 (dur) view <front|right|back|left> (yaw ..)` and writes a sheet (one row
   per candidate) to `$H2/mocap/shots/`. Look at it (Read tool). Tracking runs at about 14 frames a
   second (a 20 s chapter is about 70 s).
2. **Write the spec entry** (below) in `specs/<set>.json`: the clip's name, kind and 2-4 takes.
3. **Build** (light):
   ```bash
   "$PY" -I build.py specs/<set>.json <clip>          # just that clip; no names = every clip of the set
   ```
   It prints, per take: the measured camera yaw / pitch, how well it sees each body axis, left / right
   swaps fixed, dropped frames; the re-projection numbers (below); foot contact, slide, speed; writes the
   pair sheet `$H2/mocap/sheets/<set>/<clip>.jpg`, rewrites the set module from every built clip and runs
   the checker. Exit code 1 if a format rule fails.
4. **Look at the pair sheet** (Read tool) and judge it (below). Fix the SPEC (takes, marks, options), not
   the output. Repeat 3-4.
5. Commit the spec and the set module (never anything from the work folder).

One clip costs about 1-2 minutes of tracking (locked) and 5-20 s of building; your own time is mostly
picking takes and reading sheets: 15-30 minutes a clip for a new kind, 5-10 for one like a finished one.

The checker alone: `node check.mjs ../../src/entities/hero2/clips/<set>.js` (pure JS, uses the game's own
`skeleton.js`; `--json` for numbers).

Other tools (all light):

| command | does |
|---|---|
| `"$PY" -I bladesheet.py specs/<set>.json <clip> [take] [--every 2] [--from t] [--to t]` | the blade as detected in one take's frames (cyan = found, grey = unknown, filled later), with a full-frame pixel ruler for hand keys |
| `"$PY" -I proportions.py [config.json]` | his build from standing takes; writes `$H2/mocap/proportions.json` and an HDIM proposal |
| `"$PY" -I keysheet.py specs/<set>.json <clip> [take] [--from t] [--to t] [--every 3] [--box x,y,side]` | a labelled ruler sheet of one take's frames for 2D hand keys (see the roll example) |
| `bash "$H2/lock.sh" <you> "$PY" -I track.py <film> <t0> <t1> --forget` | HEAVY: drop and re-track a span (after a tracking fix, or when a crop latched onto a phantom); if it runs out of budget, run it again WITHOUT `--forget` |

Look at a span's raw tracking before you trust it: a sheet of the tool's own landmarks over the frames
shows phantoms (a skeleton drawn on a statue or the building), cut-off feet and swapped arms at once. The
build drops most such frames by itself (size jumps, out-of-picture points), but a take that is mostly
phantom must be re-tracked or dropped.

## The spec

```json
{
 "set": "moveGround", "title": "Movement: the basics", "film": "move",
 "out": "src/entities/hero2/clips/moveGround.js",
 "clips": [
  {"name": "walk", "title": "Walk", "src": "move 0:32-0:54", "kind": "loop", "fps": 30,
   "travel": "forward", "symmetric": 1,
   "takes": [{"t0": "0:35.50", "t1": "0:39.20", "view": "right"},
             {"t0": "0:44.30", "t1": "0:48.10", "view": "back"}],
   "from": "walk", "to": "walk"}
 ]
}
```

Clip keys:

| key | meaning |
|---|---|
| `name`, `title`, `src`, `from`, `to`, `props` | copied into the clip (README format). `src` starts with `move ` or `sword ` and gives the chapter's times |
| `kind` | `hold` (a held stance: each take's median pose, fused, repeated `n` frames as a loop), `loop` (a cycle: period measured, every cycle averaged into one, wraps exactly), `oneshot` (one performance; the first take's span is the clip) |
| `fps` | 30 for locomotion, 60 for attacks and anything fast |
| `takes` | list of `{t0, t1, view}`; `view` is a HINT of where the camera sees him from: `front`, `back`, `right` (he faces picture-right: the camera sees his left side), `left`, or the diagonals `front-right` ... The tool measures the real yaw and uses it when it is within 50 degrees of the hint. Optional per take: `film`, `flip: true` (the tool mirrored him: swap sides and depth), `yaw`, `pitch` (degrees, force), `name` |
| `period`, `period_lo`, `period_hi` | loops: force the cycle (s) or the search range (the default 0.4-2.5 s can lock onto one step instead of two: give a range round the true cycle) |
| `symmetric` | loops: 0..1, average the cycle with its mirror half a cycle on (unarmed gaits; it fixes a side take's leg mix-ups; never for a move with a held sword) |
| `travel` | loops: `forward` keeps only the forward part of the root's travel; `free` keeps the measured direction (strafes) |
| `search` | one-shots: how far (s) the other takes' alignment may move them (default 0.5) |
| `ground` | `feet` (default) or `body` (tumbles: a shoulder or the back may be the lowest point) |
| `contact_h` | loops: how far above its own floor a foot still counts as planted (m, default 0.04) |
| `phases`, `events` | one-shots: VIDEO times in the FIRST take: `"phases": {"windup": "0:24.35", "active": "0:24.52", "recover": "0:25.10"}`, `"events": [{"t": "0:24.45", "name": "hit"}]` |
| `sword` | true: find the blade in the picture and put it on the right hand (`weaponR`) |
| `blade_keys` | hand keys for the blade where detection fails: `[{"take": 0, "keys": [["0:24.50", x, y], ...]}]`, the tip's pixel in that take's frame |
| `sheet_frames`, `sheet_k` | which clip frames the pair sheet shows (default 8 spread evenly) |
| `turn` | true: he turns during the clip (pivots, 90 degree turns, turning in place, turnaround). The root's yaw follows his facing (hips, shoulders, feet, nose; smoothed) so the clip ENDS facing the new way; the body is retargeted in the frame that turns with him, his hips' and spine's own twist on top. Without it a one-shot that ends turned more than 45 degrees prints a hint |
| `travel` (loops) | `forward`, `free` (the measured direction) or a NUMBER: the travel direction in degrees in his frame (0 forward, 90 his left, -90 his right, 180 backward): strafes face their aim while travelling sideways |
| `air` | jumps and falls: `{"take": 0, "stand": ["6:40.10", "6:40.40"]}`: frames with no planted foot take the pelvis' height from that take's PICTURE (a FIXED side camera: his pelvis above the ground line, metres per pixel from his standing pelvis height in the `stand` span, which must be in that take), joined to the contact heights at take-off and landing |
| `qa` | `{"maxStepDeg": 30, "reason": "..."}`: raises the one-frame joint step limit (default 1500 deg/s: 50 at 30 fps, 25 at 60 fps) for this clip; the checker FAILS a clip over its limit, and an override without a reason |
| `despike` | default true: a joint that jumps beyond the step limit for a frame or two and comes back (the tool losing a limb) is bridged by slerp; false keeps the raw data |
| `clavicles` | default 0.3: each clavicle takes this share of its upper arm's lift (a shrug when the arm goes up) and forward swing (a reach); 0 = clavicles at rest |
| `breath` | holds: `true` or `{"period": 3.6, "chest_deg": 1.2, "shoulder_deg": 1.0}`: a SYNTHESIZED slow breath (the tool's noise hides the real one): chest and shoulders rise. Give the hold `n` = a whole number of periods at its fps (3.6 s at 30 fps = 108). The build log says "SYNTHESIZED" |
| `pose_keys` | `[{"t": "11:19.55" or "f": 12, "joint": "thighL", "euler": [x, y, z] or "dir": [x, y, z], "blend": 4}]`: a joint's local rotation (degrees, XYZ, rest = 0) or a bone's direction in his root frame (+X his left, +Y up, +Z front), reached at that frame and eased over `blend` frames each side. For what 2D keys cannot settle (a hand's roll, a flask's angle, a foot behind the body) |
| take `drop` | `[["t0", "t1"], ...]`: spans of THAT take the tracker lost (tumbles, lying down, blur, a cut). Inside, every point is interpolated from the frames round the span (through the take's `keys`), and the span hardly counts in the fusion |
| take `keys` | `[{"t": "11:19.43", "pts": {"hipL": [835, 522], "kneeL": [791, 440], ...}}]`: 2D hand keys, full-frame pixels read off `keysheet.py`. The point's depth comes from the tracked frames round the span; frames near a key count fully in the fusion. Names: nose, earL/R, shoulderL/R, elbowL/R, wristL/R, pinkyL/R, indexL/R, thumbL/R, hipL/R, kneeL/R, ankleL/R, heelL/R, toeL/R. When a side is hidden, give both sides the same point (the body's middle) |
| take `fixed` | true: this take's camera does not move; a loop then also reports its speed from the picture |
| take `no_arm_check` | sword clips: skip the "blade in the tool's left fist" arm swap for this take |
| `grip` | two hands on one grip: `{"gap": 0.11, "free": [["t0", "t1"]]}`: the left fist closes on the grip `gap` m below the right (toward the pommel); the left arm is re-solved to it (elbow on its measured side). `free`: video times (first take) where the footage shows the left hand off the grip; it eases out and back |
| `swordL` | true: a second sword in the LEFT hand (paired swords): found and solved like the right one; `blade_keys_L` keys it |
| `blade_keys` | `[{"take": 0, "keys": [["0:24.50", x_tip, y_tip] or ["0:24.50", x_hilt, y_hilt, x_tip, y_tip], ...]}]`: the blade in the picture. Use the hilt + tip form when the tool's fist is wrong. Keys in TWO takes (both seeing that moment) give the blade's 3D direction from both; one take uses a prior |
| `blade_max_dps` | default 1500: the blade's turning speed limit in the forearm's frame (deg/s), against wrong rays |

## Author's checklist (every clip)

1. Find the chapter's time in `H2/CATALOG.md`; track it (locked, repeat until `0 frames left`).
2. `shots.py` on it: read the sheet; pick 2-4 takes from DIFFERENT sides, each one view, no cut inside
   (a take may end at a cut: the next take covers the rest, see "Stitching").
3. Write the clip in the spec (copy the nearest worked example below); `build.py specs/<set>.json <clip>`.
4. Read the pair sheet in AT LEAST TWO views (a side view for lean and stride, a front or back view for
   width and sway). Look at the legs first (phase), then the arms, then the head. Fix the spec, rebuild.
5. The checker must be green (`all rules pass`). A step-limit override needs a reason you saw in the footage.
6. Commit the spec and the set module. Note in the commit what is keyed or synthesized.

## The footage's traps

- **Capture freezes**: the recorder sometimes repeated one picture for a second while the video stalled.
  In a moving take such runs are dropped (they would freeze him); an idle can be this still, so in a still
  take they stay (harmless).
- **Glitched frames**: single frames zoomed far in, or a cut to a close-up for a few frames. A one-frame
  size spike is dropped; a sustained zoom is kept (he is the same size a few frames on).
- **Cinematic cameras in attacks, jumps and rolls**: the camera often cuts, swings or zooms during the
  move itself. Cut a take at the cut (or `drop` the span) and let another take cover it.
- **Phantoms**: the tool sometimes finds a "person" in a statue or a dome when he blurs; the tracker
  refuses a detection that jumps away AND changes size, and searches round his last place.

## Contact spans and the wrap

A loop's planted span that runs over the end is written as two spans: with `n = 40`, `L: [[0, 6], [21, 39]]`
means ONE plant from frame 21 through 39, 0 ... 6 (it wraps). The engine should join a span ending at
`n - 1` with one starting at 0. A planted, FLAT foot has its ankle exactly `HDIM.ankle` above the ground
(the build levels the sole during the first 70 % of the span and bends the toes at push-off).

## Worked examples (in `specs/moveGround.json`, `specs/swordOne.json`)

**Turning (runPivot)**: `"turn": 180` makes the root's yaw follow his facing and scales the measured turn
to exactly 180 (a 90-degree turn: `90` or `-90`, his left is positive; `true` keeps the measured angle).
The clip ends facing the new way, so the engine can chain it. The take's camera yaw is measured on the
take's first 0.35 s (`calm`), so start the take while he still faces the old way.

**Strafes**: a loop with `"travel": 90` (his left), `-90`, `180` (backward), `45` ...: the root keeps
facing his aim, the travel goes that way. Fold, symmetric (careful: a strafe is not left-right symmetric
when he steps sideways; use `symmetric` only for straight forward / backward gaits).

**Airborne (jumpIdle)**: with no planted foot the hips follow a ballistic arc between the take-off and
landing heights (default). Where a FIXED side camera sees the jump (the reference's jump cameras tilt and
zoom with him, so check the background does not move), `"air": {"take": 0, "stand": ["6:41.95", "6:42.05"]}`
takes the pelvis' height from that take's picture instead (the stand span: both feet down, in that take).

**Hand keys (roll)**: the tracker loses the tumble. 1) `keysheet.py specs/moveGround.json roll 0 --from
11:19.10 --to 11:20.10 --every 4 --box 560,330,440` (the box: x, y, side in full-frame pixels round him;
without it the tool guesses one) 2) read the pixel positions of what you can see (the ruler is in
full-frame pixels; the tool's own points are drawn thin and labelled, so you see which are wrong) 3) add
to that take `"drop": [["11:19.24", "11:19.84"]]` and `"keys": [{"t": "11:19.35", "pts": {"hipL": [917,
434], ...}}, ...]` (5 keyed frames over 0.6 s were enough), and `drop` the same moment in the other takes
(no keys there: they then hardly count) 4) build and read the sheet. When one side is hidden, key both
sides at the body's middle. A pose the picture cannot settle (a hand's roll, a foot behind him): a
`pose_keys` entry.

**Step limit**: the checker fails a clip where a joint turns more than 1500 deg/s in one frame (50 deg at 30
fps, 25 at 60). Most such jumps are the tool losing a limb; `despike` (on by default) bridges them. A real
fast motion: `"qa": {"maxStepDeg": 30, "reason": "the take-off: the right knee snaps straight ..."}`.

**Breathing holds**: `"breath": {"period": 3.6}` with `"n": 108` at 30 fps. SYNTHESIZED, logged as such.

**Two hands on one grip (swordTwo)**: `"sword": true, "grip": {"gap": 0.11, "free": [["9:30.10",
"9:30.40"]]}`: the left fist closes on the grip below the right; `free` where the footage shows it off.

**Paired swords (swordPair)**: `"sword": true, "swordL": true`: the right and the left blade, each found
from its own fist (both rust-red in the footage), `blade_keys` / `blade_keys_L` for keys.

**Flask, bell (moveMisc)**: `props: {"L": "flask"}`; nothing is detected; give the left hand's roll with
`pose_keys` on `handL` where the picture shows the flask's angle.

**Clavicles and toes**: automatic (`clavicles`: 0.3 of the upper arm's lift and reach; toes bend at
push-off on planted feet).

**Loop speed from the picture**: mark a fixed-camera take `"fixed": true`; the build prints both speeds
(the planted-foot one, which the clip uses, and the picture's).

## How to pick takes

- Two or three takes from DIFFERENT sides: a side take (`right` or `left`) for forward / up (lean, stride,
  arm swing fore and aft) and a `front` or `back` take for left / right (stance width, sway, arms out).
  One view alone guesses its depth axis; the pair sheet shows it immediately.
- Inside one camera shot he often turns round and the follow camera swings without a cut: a take must
  have ONE view. `shots.py` splits on view changes; still check the sheet.
- Avoid: frames where he is cut off by the picture's edge (dropped automatically, but a take full of
  them is useless), glitched zoomed frames (dropped automatically), capture freezes (dropped in moving
  takes), the ponytail across his back in back views at the start of a move (the shoulders wobble),
  close-ups.
- Loops: at least two full cycles per take (more is better: they are averaged). One-shots: give the
  first take a span that starts a little before the move and ends after it settles; give the other takes
  the same moment as `t0` to within `search` seconds.

## How the method works (mlib/)

| module | does |
|---|---|
| `track.py` | the pose tool (heavy model, IMAGE mode) per frame on a square crop that follows him (1.8x his size), whole frame on a miss; 2D image landmarks + the tool's 3D landmarks cached per second of video |
| `takes.py` | a take: drop misses, freezes, glitched or out-of-picture frames; resample to 60 fps by TIME (the capture drops frames); fix left / right swaps per limb pair (a constant-velocity Viterbi over kept / swapped); the camera's pitch (from his standing axis) and yaw (feet, nose, hips and shoulders pooled; a back view read as a front view is detected against the hint and un-mirrored); his body frame (+X his left, +Y up, +Z front) |
| `fuse.py` | one-shots: time offsets by matching what both cameras see; loops: period (autocorrelation, refined by fold agreement) and folding; fusion per body axis weighted by how well each camera sees that axis; re-projection error |
| `retarget.py` | bone directions -> joint rotations (hinges held through straight elbows / knees, spine and neck split between their ends, the head from ears / eyes / nose); contact (loops: the strike-to-push-off half of each foot's swing, while low; one-shots: low and still over the ground); the hips' height from the planted foot; root travel; two-bone IK that holds planted feet still; joint limits on the ankles, free hands and head |
| `sword.py` | the blade in the picture: rays from the right fist scored by the blade's colour (dark rust red: red well above green and blue, little green, which rejects the gold leaves and the warm stone), a smooth DP over frames; frames with no good ray are UNKNOWN. 3D from two takes' planes (time-aligned), or one take + a prior (across the forearm on the thumb side). Unknown frames are filled in the FOREARM's frame (the blade is rigid in the fist), so a blurred cut follows the arm. Also: where the blade leaves the tool's LEFT fist, the tool swapped his arms; they are swapped back. Hand keys override |
| `clip.py` | one clip from its spec entry; saved per clip under `built/` |
| `view.py` | FK of the built clip drawn from each take's camera: the pair sheets |
| `export.py` | the set module |

## How to judge a pair sheet

Each take gives three rows at the same clip frames: the reference frame (the tool's landmarks thin:
his left green, right red), OUR skeleton from that camera at the same scale, and ours over the reference.
Our colours: left green, right red, spine yellow, the blade cyan, a planted foot a white dot.

- Same moment? Compare the legs first: the forward leg, the bent knee. A phase off by half a step in one
  take means that take's alignment failed (check its numbers; drop it or narrow `search`).
- Arms swapped (green where red should be), a knee bending backwards, an elbow flipping: look at that take's
  own row; usually one bad take; drop it.
- The depth axis of a take is the one its camera cannot see: judge lean on a side take, width on a front
  take, never the reverse.
- Our skeleton is OUR build (longer legs, our head) and our joints are not the tool's points, so the
  overlay is never exact: judge angles and timing, not centimetres.
- The numbers printed per take, `reprojection on <take>`: the error (median / 90th percentile, % of his
  torso length) of (a) each other take alone, (b) the fusion of the others, (c) everything fused,
  (d) the take itself. (b) below (a) means fusion helps; a take whose own (d) is above ~20 is a poor take.
- Checker numbers: `slide` (cm, a planted foot) must stay under 3; `lowest` above -3 cm; a loop's `wrap`
  near its `max step` (a wrap much bigger than the biggest step is a pop).

## What goes wrong and how to fix it

| symptom | cause | fix |
|---|---|---|
| `N frames ... are not tracked` | the span is not in the cache | `track.py` under the lock |
| `measured yaw .. vs hint ..: using the hint` | the hint is wrong, or the view is diagonal | read the measured yaw; change the hint (a `back-left` that measures -80 is `left`) |
| `the tool mirrored him` | back view read as front | nothing (handled); if a take still looks mirrored, `flip: true` |
| a loop's period is half / double | one step locked instead of two | `period_lo` / `period_hi` round the true cycle, or `period` |
| feet planted the wrong half / speed absurd | contact rule fooled | loops: `symmetric`; check `contact_h`; one-shots: give `ground` |
| one take ruins the fusion (its "alone" numbers >> the others') | bad tracking (ponytail, blur, closeups) | drop the take |
| an ankle or wrist twitches | the tool's heel / toe / hand points | already limited and smoothed; worse cases: shorten the take round the bad frames |
| the blade flips or points into the body | detection failed (blur, edge-on) | `blade_keys` from a sheet of the bad frames |
