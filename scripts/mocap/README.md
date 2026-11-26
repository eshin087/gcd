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

## The spec

```json
{
 "set": "moveBasic", "title": "Movement: the basics", "film": "move",
 "out": "src/entities/hero2/clips/moveBasic.js",
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
| `sword.py` | the blade in the picture (rays from the fist scored by the blade's rust colour, a smooth DP over frames), 3D from two takes' planes or one take plus a prior; hand keys |
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
