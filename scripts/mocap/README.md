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
   # it stops itself at --budget (default 360 s from its start, model load included), well inside the
   # lock's rule (one job under 8 minutes; a lock older than 12 minutes is taken as dead)
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
| `"$PY" -I reach.py specs/<set>.json [clip ...] [--aim d y]` | attacks: the hips' offset from the root, whether the blade's gameplay segment passes points 1.2 / 1.9 / 2.6 m ahead at chest height between windup and active, and where the sweep passes the aim point (default 1.9 m ahead, 1.3 m up): how far it misses and on which side |
| `"$PY" -I find.py <film> <t0> <t1> <s0> <s1> [--top 12] [--min-gap 0.6]` | every other performance of the move you found at s0-s1, in the chapter t0-t1, whatever the camera |
| `"$PY" -I camcal.py <film> <t0> <t1> [...]` | calibrates the focal length of `swing` on spans where he stands while the camera orbits |
| `"$PY" -I proportions.py [config.json]` | his build from standing takes; writes `$H2/mocap/proportions.json` and an HDIM proposal |
| `"$PY" -I keysheet.py specs/<set>.json <clip> [take] [--from t] [--to t] [--every 3] [--box x,y,side]` | a labelled ruler sheet of one take's frames for 2D hand keys (see the roll example) |
| `"$PY" -I armsheet.py specs/<set>.json <clip> [take] --from t --to t [--every 3] [--cell 440] [--cols 4] [--box x,y,side] [--emit]` | the KEY sheet for `limb_keys`: big tiles with a full-frame pixel GRID (20 px; 100s labelled), the tracker's arms thin, its blade, the current keys thick (right arm orange, left lime, blade white; circled + named on a key frame, the spline between). `--emit` writes `<clip>_armkeys_take<k>.json`: one key per tile, pre-filled with the tracker's points and the detected blade, to paste and correct |
| `bash "$H2/lock.sh" <you> "$PY" -I track.py <film> <t0> <t1> --forget` | HEAVY: drop and re-track a span (after a tracking fix, or when a crop latched onto a phantom); if it runs out of budget, run it again WITHOUT `--forget` |
| `"$PY" -I phantoms.py <film> <t0> <t1> [--below Y] [--exclude x0 y0 x1 y1]` | per second of the cache: frames tracked, frames a `below` / `exclude` rule refuses, the median pelvis (px) and torso (px): finds a span fitted to a PHANTOM (MOVE 15:22-17:34: the giant statue behind him, pelvis near y 150-250 px while his is near 480-530) |
| `bash "$H2/lock.sh" <you> "$PY" -I track.py <film> <t0> <t1> --forget --box x y w h --below Y [--exclude x0 y0 x1 y1]` | HEAVY: re-track a phantom span. `--box` seeds him (0-1 fractions), `--below` refuses any detection whose pelvis is higher in the picture than y = Y px, `--exclude` a picture region (px) his pelvis is never in. With any of them the tracker NEVER falls back to the whole frame: a lost frame is retried round his last place at five sizes, else recorded as a miss (interpolated later). Spec takes may carry `"box"`, `"below"`, `"exclude"` for `track.py specs/<set>.json` |

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
| `cycle`, `time_scale` | loops: the cycle plays in `cycle` seconds (or the footage's period times `time_scale`): the fused cycle is resampled round the loop before the retarget; the travel per cycle stays, the speed follows (check it, or give `speed`). Example: `crouchSprint` from the crouch run's takes, `"cycle": 0.72` (22 frames at 30 fps instead of 25) |
| `start` | loops: frame 0 = `"plantR"` / `"plantL"` (the first frame of that foot's plant) or a phase `0.25` of the cycle as built: the cycle is rolled (pose, hips, contact), the sheets follow. Replaces shifting the first take's start time. Example: crouchRun with `"start": "plantR"` -> contact R [[0, 8]], L [[9, 20]] |
| `symmetric` | loops: 0..1, average the cycle with its mirror half a cycle on (unarmed gaits; it fixes a side take's leg mix-ups; never for a move with a held sword) |
| `sym_parts` | loops with `symmetric`: only these landmark groups are symmetrized: `["legs", "torso"]` keeps each arm's own swing (the far arm of a side take is noise that `symmetric` averaged 50/50 into the near one). Groups: `armL armR arms legL legR legs torso head`. Measured (moveGround, no pose keys, elbow bend min-max): run 32-50 both arms -> L 29-65 / R 25-45; sprint 29-49 -> L 41-70 / R 6-47 |
| `sym_vis` | loops with `symmetric`: each landmark and its mirror count by the tool's visibility (folded over the takes) instead of 50/50. On moveGround it changed little (the side takes see both arms at similar visibility) |
| take `limb_weight` | `{"armL": 0.1, "armR": 1, "legs": 0.5}`: those landmark groups of THIS take count that much in the fusion (one-shots and loops; groups as `sym_parts`): an arm's bend from the take that sees that arm side-on, not from a back view that reads a forward forearm's wrist low |
| `travel` | loops: `forward` keeps only the forward part of the root's travel; `free` keeps the measured direction (strafes) |
| `search` | one-shots: how far (s) the other takes' alignment may move them (default 0.5) |
| `ground` | `feet` (default) or `body` (tumbles: a shoulder or the back may be the lowest point) |
| `speed` | loops: `1.45` (m/s) or `"picture"`: the loop travels at that speed (in the measured direction, or the `travel` angle when nothing was measured: a walk backward seen from behind); the contact (strike to push-off along the travel) and the root are rebuilt from it and the planted feet pinned to it (the stride follows the IK). `"picture"` = the stance measure from the picture: per stance of every take that sees at least 35 % of the travel across its picture, d(pelvis x - planted ankle x)/dt in pixels, metres from his torso's picture length (0.576 m), divided by that share; the median. Every loop's log prints it (`speed from the picture: ...`) whether or not the key is given. Measured on moveGround: walk 1.39 / 1.28, run 4.29, sprint 5.3 m/s, against 0.90 / 3.05 / 3.89 from the planted feet. The STRIDE follows: the legs' swing is scaled by given / measured speed (below, `stride`) |
| `stride` | loops with `speed`: default true = each ankle's excursion along the travel about its cycle mean is scaled by (given speed / planted-foot speed), height and sideways place kept, thigh and shin re-solved by IK on the knee's own hinge, reach softly limited to 0.97 of the leg (the blend into a plant too); the log prints `stride: ... scaled 1.61x`. A number forces the scale (a gait seen from behind, whose measured speed is 0, needs one); `false` keeps the measured legs (the feet then slide) |
| `contact_h` | loops: how far above its own floor a foot still counts as planted (m, default 0.04) |
| `phases`, `events` | one-shots: VIDEO times in the FIRST take: `"phases": {"windup": "0:24.35", "active": "0:24.52", "recover": "0:25.10"}`, `"events": [{"t": "0:24.45", "name": "hit"}]` |
| `sword` | true: find the blade in the picture and put it on the right hand (`weaponR`) |
| `blade_keys` | hand keys for the blade where detection fails: `[{"take": 0, "keys": [["0:24.50", x, y], ...]}]`, the tip's pixel in that take's frame |
| `sheet_frames`, `sheet_k` | which clip frames the pair sheet shows (default 8 spread evenly) |
| `turn` | true: he turns during the clip (pivots, 90 degree turns, turning in place, turnaround). The root's yaw follows his facing (hips, shoulders, feet, nose; smoothed) so the clip ENDS facing the new way; the body is retargeted in the frame that turns with him, his hips' and spine's own twist on top. Without it a one-shot that ends turned more than 45 degrees prints a hint |
| `travel` (loops) | `forward`, `free` (the measured direction) or a NUMBER: the travel direction in degrees in his frame (0 forward, 90 his left, -90 his right, 180 backward): strafes face their aim while travelling sideways |
| `air` | jumps and falls: `{"take": 0, "stand": ["6:40.10", "6:40.40"]}`: frames with no planted foot take the pelvis' height from that take's PICTURE (a FIXED side camera: his pelvis above the ground line, metres per pixel from his standing pelvis height in the `stand` span, which must be in that take), joined to the contact heights at take-off and landing |
| `air_marks` | one-shots (jumps, falls; also with `"ground": "body"`: the flight takes the arc, only the no-penetration guard applies; hitStrong now rises 0.30 m and lands lying at 0.15 m): true = the clip's `air` and `land` events are HARD marks: no foot is planted from `air` to `land` - 1 (the lower foot used to stay "planted" through the flight and the hips sank), and outside the flight the lower foot is planted wherever no foot was found (the landing crouch stands on the ground). Example `jump`: `"air_marks": true, "air_peak_m": 0.45` flies frames 18-29 with the hips 0.43 m over take-off, lands in its keyed crouch |
| `hips_keys` | `[[frame or "t", y], ...]`: the hips' height (m) at those frames, eased between them (before the first and after the last key the built height stays: key the frame where the ground takes over too); one key in a hold or loop sets the whole clip (`fall`: `[[0, 1.6]]` floats the airborne pose instead of standing it on its lower foot). Inside the keyed frames a foot is planted only where it still touches the ground. Example `fallLand`: `[[0, 1.5], [4, 0.9]]` drops from 1.5 m onto the feet |
| `air_peak_m` | with `air_marks`: the hips' rise at the top of the flight over the take-off hips (m): a parabola between take-off and landing (default: an arc whose height comes from the flight's length only) |
| `qa` | `{"maxStepDeg": 30, "reason": "..."}`: raises the one-frame joint step limit (default 1500 deg/s: 50 at 30 fps, 25 at 60 fps) for this clip; the checker FAILS a clip over its limit, and an override without a reason |
| `despike` | default true: a joint that jumps beyond the step limit for a frame or two and comes back (the tool losing a limb) is bridged by slerp; false keeps the raw data |
| `clavicles` | default 0.3: each clavicle takes this share of its upper arm's lift (a shrug when the arm goes up) and forward swing (a reach); 0 = clavicles at rest |
| `breath` | holds: `true` or `{"period": 3.6, "chest_deg": 1.2, "shoulder_deg": 1.0}`: a SYNTHESIZED slow breath (the tool's noise hides the real one): chest and shoulders rise. Give the hold `n` = a whole number of periods at its fps (3.6 s at 30 fps = 108). The build log says "SYNTHESIZED" |
| `bone_keys` | 3D KEYS (attacks first; any clip): `{"blend": 4, "space": "root", "keys": [{"t": "1:15.34" or "f": 30 (loops: "f" or "phase"), "upperArmR": [x, y, z], "foreArmR": .., "blade": .., "flat": .., "chest": {"lean": 30, "side": 0, "twist": -5}, "hips": {"lean": 10, "dy": -0.15}, "thighR": .., "upperArmL": {"dir": [..], "space": "chest"}, ...}]}`: bone directions typed in the ROOT's frame (or the chest's), splined through the keys, REPLACING the tracked bones; bones not keyed stay tracked. Full rules: "Attacks, 3D keys" below and `mlib/bonekeys.py` |
| `pose_keys` | `[{"t": "11:19.55" or "f": 12, "joint": "thighL", "euler": [x, y, z] or "dir": [x, y, z], "blend": 4}]`: a joint's local rotation (degrees, XYZ, rest = 0) or a bone's direction in his root frame (+X his left, +Y up, +Z front), reached at that frame and eased over `blend` frames each side. For what 2D keys cannot settle (a hand's roll, a flask's angle, a foot behind the body) |
| take `drop` | `[["t0", "t1"], ...]`: spans of THAT take the tracker lost (tumbles, lying down, blur, a cut). Inside, every point is interpolated from the frames round the span (through the take's `keys`), and the span hardly counts in the fusion |
| take `keys` | `[{"t": "11:19.43", "pts": {"hipL": [835, 522], "kneeL": [791, 440], ...}}]`: 2D hand keys, full-frame pixels read off `keysheet.py`. The point's depth comes from the tracked frames round the span; frames near a key count fully in the fusion. Names: nose, earL/R, shoulderL/R, elbowL/R, wristL/R, pinkyL/R, indexL/R, thumbL/R, hipL/R, kneeL/R, ankleL/R, heelL/R, toeL/R. When a side is hidden, give both sides the same point (the body's middle) |
| take `fixed` | true: this take's camera does not move; a loop then also reports its speed from the picture |
| take `no_arm_check` | sword clips: skip the "blade in the tool's left fist" arm swap for this take |
| `grip` | two hands on one grip: `{"gap": 0.11, "free": [["t0", "t1"]]}`: the left fist closes on the grip `gap` m below the right (toward the pommel); the left arm is re-solved to it (elbow on its measured side). `free`: video times (first take) where the footage shows the left hand off the grip; it eases out and back |
| `swordL` | true: a second sword in the LEFT hand (paired swords): found and solved like the right one; `blade_keys_L` keys it |
| `blade_keys` | `[{"take": 0, "keys": [["0:24.50", x_tip, y_tip] or ["0:24.50", x_hilt, y_hilt, x_tip, y_tip], ...]}]`: the blade in the picture. Use the hilt + tip form when the tool's fist is wrong. Keys in TWO takes (both seeing that moment) give the blade's 3D direction from both; one take uses a prior |
| `blade_max_dps` | default 1500: the blade's turning speed limit in the forearm's frame (deg/s), against wrong rays |
| `swing` | clip or take: true = the camera's own swing is measured per frame from the picture's BACKGROUND (`mlib/camflow.py`) and every frame gets its own camera direction (fusion, re-projection, the blade's planes, the sheets). Use it on follow-camera takes; a take without it whose camera swings more than 10 degrees prints a hint |
| `yaw2d` | clip or take: true = the take's camera yaw is taken from how WIDE his shoulder and hip lines look in the picture (the tool's 3D depth only picks the branch: front / back, his left / right). Only when the take's first 0.35 s is calm (he stands); the build log prints both values |
| `face` | one-shots: `"start"` (his facing over the first 0.2 s), `"hit"` (the blade's direction at the first `hit` event: attacks) or a number (deg): the clip is turned so that this is its +Z, the way the game aims it. EVERY attack needs it (the game aims a clip by its +Z) |
| `arm_fix` | sword clips: `"whole"` = the blade decides which arm is his right over the WHOLE take (a two-state path; a lunge where the blurred blade is lost keeps the side its neighbours prove) instead of a 5-frame vote |
| `blade_blur` | sword clips: true = where the colour finds no blade, rays score what MOVED against the neighbouring frames (the fan of a blurred cut; the middle of the fan is its direction). Check it on `bladesheet.py` (magenta = weak / fan) |
| `flight` | one-shots: `"picture"` = through frames with NO planted foot (a hop back, a roll, a leap) the root travels as his pelvis moves against the FLOOR round his feet in each take's picture (a panning or dollying camera is taken out by the floor's own shift); two takes from different sides give both ground directions, one take its sideways one. The log prints `flight frames a-b: travel from the picture X m (coasted Y m)`. Not with `turn` |
| `travel_m`, `travel_dir`, `travel_span` | one-shots, when travel cannot be measured: the root travels `travel_m` metres toward `travel_dir` (deg in his frame: 0 forward, 90 his left, 180 back), eased over `travel_span` (two video times; default the whole clip). Replaces the measured travel |
| `root_keys` | one-shots: `[["10:58.20", x, z], [frame, x, z], ...]`: the root's ground position (m, his start frame: +x his left, +z his front) at those moments, eased between (the start is 0, 0). Replaces the measured travel |
| `root` | one-shots: `{"smooth": 0.1, "max_off": 0.15}`: the root is the ground point under his hips smoothed over `smooth` s (default 0.25) and never more than `max_off` m from it, so the hips stay over the root (the engine needs it; a lunge left them 0.5-0.9 m off). THE DEFAULT for every one-shot without `turn`, `flight` or `"ground": "body"` (since tool3; `"root": false` = the plain 0.25 s smoothing as before). Proof: moveGround's 9 starts / stops and moveEvade's 6 crouch clips rebuilt with it: checker numbers identical (steps, slide), the hips' worst offset from the root 0.16-0.77 -> 0.09-0.50 m (runStop 0.77 -> 0.50, sprintToCrouch 1.01 -> 0.51); backstep (flight) and the turns unchanged; tried on backstep it went over the step limit, hence the exclusion |
| (attack defaults) | a one-shot with `phases` and no `face` gets `"face": "travel"` (a cut that travels under 0.15 m to its active frame keeps its facing) |
| `foot_ease` | degrees a frame (e.g. 14 at 60 fps): the feet and toes turn no faster (the sole-levelling at a plant or a lost foot snapped them 79-138 degrees in one frame) |
| take `facing` | `"away"` / `"toward"`: a HARD prior that he faces away from (toward) this camera through the whole take (a lock-on camera behind him). Every frame the tool read the other way round is mirrored back (a 3-frame majority of the tool's own frames, BEFORE the left / right swap fix, which is then told that his left hip and shoulder are on the picture's left (away) or right (toward)); the log prints how many |
| take `below`, `exclude` | phantoms: `"below": 300` = a cached frame whose pelvis is higher in the picture than y 300 px is not him (dropped as a miss); `"exclude": [[x0, y0, x1, y1]]` = nor one whose pelvis is in that region (px). The log's note says how many. The same keys steer `track.py specs/<set>.json` |
| `free_hand` | true or `{"sigma": 2.0, "flex": 12}`: the free hand from the tool's hand points where they look like a hand, a relaxed hand along the forearm where not |
| `vis_weight` | true: in the fusion each landmark also counts by the tool's VISIBILITY in that take (a far arm hidden behind the body in a side take hardly counts; one-shots and loops) |
| take `limb_keys` (alias `arm_keys`) | KEY-FIRST (attacks, jumps, anything the tracker loses): `{"blend": 3, "keys": [{"t": "1:15.34", "pts": {"shoulderR": [x, y], "elbowR": .., "wristR": .., "hilt": .., "tip": .., "kneeL": .., ...}, "near": ["elbowR"], "far": ["tip"]}, ...]}`. Each given point REPLACES the tracker (in 3D, not only the picture) from its first key to its last, on a smooth spline between keys, easing back over `blend` frames. Depth from ONE take: roots (shoulders, hips, nose, ears) keep the tracker's depth; every other point hangs off its parent at the bone's length (shoulder>elbow>wrist, hip>knee>ankle>heel/toe, hilt>tip); `near` / `far`: that point is nearer / farther from the camera than its parent (else the tracker's sign). The keyed blade wins over the detector; a keyed free hand relaxes along the forearm; despike leaves keyed arm joints alone. Points: nose, earL/R, shoulder/elbow/wrist L/R, hip/knee/ankle/heel/toe L/R, hilt, tip. Keys in two takes at one moment are triangulated |
| take `lose` | `[{"t0": "1:15.41", "t1": "1:15.78", "limbs": ["armL", "armR"]}]`: the tracker's points of those limbs are thrown away over the span and bridged (3D and picture) from the frames round it; other limbs stay tracked (unlike `drop`, which bridges every point). Limbs: `armL`, `armR`, `legL`, `legR`, `torso` (shoulders, hips; the picture fit is bridged too), `head`, `body`. `limb_keys` inside the span give the motion |
| take `check` | true: the take is aligned (or synced) and drawn on the pair sheet from its own camera, but NOT fused: a second view to judge the clip by (attacks: the follow-camera takes turn with the camera, so fusing them is wrong) |
| `sync` (clip) + take `sync` | the same moment by hand: clip `"sync": "1:15.342"` (a video time in the first take) = take `"sync": "0:56.456"`; that take is placed by it instead of the automatic alignment (which was 0.1-0.3 s off on attacks) |
| `blade_color`, `blade_color_L` | `"rust"` (default) or `"steel"` (a bright grey blade: the paired set's left sword) |

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
  refuses a detection that jumps away AND changes size, and searches round his last place. A span that is
  phantom from its start (MOVE 15:22-17:34: the giant statue; also check 29:51-30:27 and SWORD 1:06-1:08)
  is found by `phantoms.py ... --below Y` and re-tracked with `--box ... --below Y` (example: strafes,
  `track.py move 15:56.2 15:58.5 --forget --box 0.53 0.55 0.12 0.3 --below 300`, then `"below": 300` on
  the take so a frame the re-track still missed is not taken from the old cache).

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

**Hops and rolls (flight, travel)**: `backstep` (MOVE 10:57, three takes) coasted 0.07 m through its hop;
with `"flight": "picture"` it travels 1.5 m back (no `swing`; with `swing` the contact test found no flight
and it fell to 0.2 m: check the log's `flight frames` line, and give `"travel_m": 1.5, "travel_dir": 180`
when it is missing). `roll` (MOVE 11:19, four takes) went 0.6 m: with `flight` + `swing` 2.6 m forward.

**Facing away (strafes from behind)**: give every take of the lock-on camera `"facing": "away"`; do not force
`"yaw": 180` on a take the tool read as a front view (the whole-take mirror then fights the frames it
already had right).

**Breathing holds**: `"breath": {"period": 3.6}` with `"n": 108` at 30 fps. SYNTHESIZED, logged as such.

**Two hands on one grip, paired swords (`specs/_examples.json`, not a set)**: `twoLight1` is the first
two-handed light attack (SWORD 9:27, two takes): `"sword": true, "grip": {"gap": 0.11}` closes the left
fist on the grip below the right (`"free": [["t0", "t1"]]` where the footage shows it off). Built as a
DRAFT to prove it: the hands hold together through the cut, the blade's direction is still rough in about
a third of the frames (key it). `pairIdleExample` is the paired idle: `"swordL": true` finds the left
blade from the left fist (`blade_color_L`: `"rust"` or `"steel"`), `blade_keys_L` keys it. Build them
with `build.py specs/_examples.json <clip> --no-export` (sheets under `sheets/toolExamples/`).

**Flask, bell (moveMisc)**: `props: {"L": "flask"}`; nothing is detected; give the left hand's roll with
`pose_keys` on `handL` where the picture shows the flask's angle.

**Finding every take of a move (find.py)**: a combo chapter plays the combo growing hit by hit, and the
camera (or his facing) differs between rounds. Find one performance by eye, then
`"$PY" -I find.py sword 41 100 0:29.45 0:30.15 --top 14 --min-gap 1.5` lists the moments his joints do the
same (camera-free: distances between joints in the tool's 3D). Costs are rough (lunges are noisy): check
the candidates on a strip and give each take's `t0` the same moment to within `search`. A take that
aligns at exactly +-`search` did NOT align: fix its time or drop it.

**The camera (swing, yaw, face; light1)**: `"swing": true` measures the camera's own turn per frame from
the background (`camcal.py sword 2.2 4.4 5.3 7.4 ...` calibrated it: f = 760 px). Measured in the SWORD
film's light chapter: the follow camera turns only 6-10 degrees per take (0:23-1:01), the second shot
(1:01.8-1:40) is FIXED and he faces a new way each round, which is where the other views come from. The
bigger error is the take's YAW: it is measured on the take's first 0.35 s (the first take is not padded,
so start it while he still stands) and a hint more than 50 degrees off replaces it. When the log's
`yaw .. (hips .. feet .. nose ..)` parts disagree by more than ~30 degrees, give `"yaw"` yourself: e.g.
light1's first take measured -5 on a view that the other three performances measure at 69-76, so it has
`"yaw": 70`. Then `"face": "hit"` turns the finished clip so the cut is aimed along +Z (the engine aims a
clip by its +Z; without it light1 was built 171 degrees off).

**Attacks, KEY-FIRST from one take (light1; `specs/_examples.json` `light1Keyed`)**: the follow-camera takes of
an attack cannot be fused (he turns toward the camera at the first hit) and every view fails inside the
cut, so build the attack from ONE clean take (the fixed back rounds) and key it:
1. the clip: the one take (`"view": "back"`), plus the other views as `"check": true` takes placed by
   `"sync"` (clip `"sync": "1:15.342"`, take `"sync": "0:56.456"`): they are drawn on the sheet, not fused.
2. `armsheet.py specs/<set>.json light1 0 --from 1:15.05 --to 1:15.80 --every 3 --emit` (add `--box x,y,side`
   to zoom on him when he is small: tiles should show at least 1.5 sheet px per frame px). Read the sheet:
   the tracker's arms thin, its blade cyan.
3. paste the emitted JSON as the take's `"limb_keys"`; fix every wrong point by reading the grid (only the
   wrong ones: the pre-fill is the tracker's own); drop tiles you do not need (a key every 2-3 frames in
   the cut, 4-6 in the coil and the follow-through). Give `hilt` and `tip` where the blade is seen; where
   it is only a smear, key the tip along the smear's leading edge or leave it out (it follows the arm).
4. where the tracker loses whole limbs (labels the coiling arm as the other one, loses him, a close-up):
   `"lose": [{"t0": .., "t1": .., "limbs": ["armL", "armR"]}]` (or `legL` / `body`) and key those limbs there.
5. build; check the depth on the check takes' rows; flip a bone with `"near"` / `"far"` in a key where it
   points the wrong way, or a `pose_keys` `"dir"`; give the lunge's travel with `travel_m` / `root_keys` when
   the one take cannot see it (a back view does not see travel along its axis); `reach.py` must say YES
   at 1.9 m; `"qa": {"maxStepDeg": .., "reason": "keyed cut ..."}` for the real speed of the cut.
Rebuild after each pass (20-40 s); the sheet's thin lines on the reference rows are now YOUR keys.

**Attacks, 3D keys (`bone_keys`; `specs/_examples.json` `light1Bone`)**: the authors who got the hard moves
right (the roll, the run's arms, the crouches, the jump) did it by TYPING BONE DIRECTIONS in his own frame, not
by keying pixels in one blurred view. `bone_keys` makes that the attack path:
- A key gives, at one frame, any of: `upperArmL/R`, `foreArmL/R`, `handL/R` (wrist -> fingers), `thighL/R`,
  `shinL/R`, `footL/R` as a direction `[x, y, z]` (any length; +X his LEFT, +Y up, +Z his FRONT, in the clip's
  frame: with `"face": "travel"` the clip is turned AFTER the keys, by the angle the log prints (a few degrees
  for a straight lunge); with `"face": "hit"` / a number, before); `blade` (the sword's +Z) and `flat` (the
  normal of its flats; without it the hand's long axis stays near the forearm); `chest`, `hips`, `head` as
  `{"lean": deg forward, "side": deg to his left, "twist": deg toward his left}` (absolute in the root frame;
  a given dict's missing angles are 0; the spine / neck take half of the chest's / head's turn); `hips` also
  `dx / dy / dz` (m): offsets of the hips (a lunge's drop: `"dy": -0.15`). `"space": "chest"` (whole set, or
  per bone as `{"dir": [..], "space": "chest"}`) reads a bone in the chest's frame (an arm that turns with
  the shoulders).
- Each channel is a cubic spline through the keys that give it: no stop at a key (two EQUAL keys in a row
  hold), eased from / to the tracked motion over `blend` frames before its first and after its last key
  (a loop's channel with two or more keys wraps the cycle: "pose keys for both arms through a loop" is
  `"bone_keys": {"keys": [{"phase": 0, "upperArmR": .., "foreArmR": .., ..}, {"phase": 0.5, ..}]}`).
- Two keys of a bone more than 45 degrees apart are joined on the GREAT CIRCLE (not the chord). A swing of
  more than about 120 degrees can take either way round: add a key in between (a loop's arm swing wants
  four keys a cycle: back, down, front, down).
- An arm or leg keyed with both bones at a frame takes its elbow / knee hinge from them; otherwise the
  hinge stays continuous with the frame before (no flip). Keyed bones are kept from `despike`.
- Legs: key the STEPPING leg; leave a planted leg to the foot pinning (it is re-solved as the hips move:
  keying a planted leg against a given `travel_m` makes it slide). Give the lunge's travel with `travel_m`
  / `travel_span` ending when the front foot lands.
Workflow (light1Bone, the back take + two `check` takes, 7 keys, about 30 minutes):
1. the clip as for KEY-FIRST above (one fused take, the others `"check": true` + `"sync"`); `lose` the arms
   over the cut so nothing tracked fights the keys.
2. read the frames of the coil, the cut and the follow-through on the pair sheet's rows (a key every 3-6
   frames: the spline carries between); type the directions: e.g. frame 29 (the deepest coil) `"upperArmR":
   [-0.9, 0.3, 0.2], "foreArmR": [-0.8, 0.2, -0.5], "blade": [-0.8, 0.5, -0.3], "chest": {"twist": -35, "lean": 15}`
   (arm out to his right, forearm and blade cocked back), frame 33 (mid-cut) `"upperArmR": [-0.4, 0.1, 0.9],
   "blade": [0.3, 0, 0.95], "chest": {"twist": -5, "lean": 30}, "hips": {"lean": 10, "dy": -0.15},
   "thighR": [0, -0.55, 0.84], "shinR": [0, -1, 0.05]` (the lunge).
3. build (20-40 s) and read the sheet: OUR skeleton is drawn from EVERY take's camera (the check takes
   too), so a wrong direction shows at once in the view that sees it side-on.
4. `"$PY" -I reach.py specs/<set>.json <clip>` prints `blade reaches ... 1.9 m frames 33-34` and `aim at 1.9 m
   ahead, 1.3 m up: nearest 0.10 m at frame 34 (0.09 m below)`: turn the `blade` keys round the hit toward
   the side it names (light1Bone's first pass was 0.12 m below and 0.08 m to his right: the blade at frames
   33 / 37 went from y -0.1 / -0.4 to 0 / -0.3) and rebuild. `--aim d y` aims elsewhere.

**Blurred cuts and arm swaps (light1)**: `"blade_blur": true, "arm_fix": "whole"`; check with
`bladesheet.py specs/swordOne.json light1 0 --every 1 --from 0:26.80 --to 0:27.05 --cell 400 --cols 4`;
key what is still wrong with `blade_keys` (hilt + tip form when the fist is wrong).

**A free hand (light1)**: `"free_hand": true` (or `{"sigma": 2.0, "flex": 12}`): the hand follows the tool's
hand points where they look like a hand and relaxes along the forearm where they do not. To key it:
`pose_keys` on `handL` (`"euler"`, or `"dir"` = where the fingers point in his root frame).

**Clavicles and toes**: automatic (`clavicles`: 0.3 of the upper arm's lift and reach; toes bend at
push-off on planted feet).

**Loop speed (speed)**: the planted-foot speed comes out about 1.5x too low (the fold and the fusion
lose travel). Read the log's `speed from the picture: <take> X m/s (N stances: ...)` lines (side takes) and
give `"speed": "picture"` (or the number you trust, e.g. `"speed": 1.45` for `walk`). The legs under-swing
like the arms (the stride in the data is about 2/3 of the footage's), so the stride is scaled with it:
moveGround `walk` / `run` / `sprint` at 1.45 / 4.4 / 6.4 m/s scale 1.61 / 1.44 / 1.64x, slide 0.01 cm,
worst step 17 / 20 / 32 deg, and the sprint's side-take rows now show the footage's wide split. For a gait seen only
from behind (`strafeWalkB`, `strafeRunB`: speed 0 because a back view cannot see travel along its axis)
give the number: `"travel": 180, "speed": 1.0` builds a 1.0 m/s backward walk with its contact rebuilt
(L 0-10 + 27-40, R 6-30); its slide (4.6 cm) says the back view's stride is too short for that speed.
A fixed-camera take with `"fixed": true` also prints the older whole-take picture speed.

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
