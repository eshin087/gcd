# scripts/mocap/duelist: reference footage → a boss's blows (the melee attack animation engine)

The bosses built on the duelist engine (`src/entities/enemies/duelist/`: Tian Lei, Wen Yao, the Ash
Disciple, the Starless Lord, ...) are animated by KEYFRAMES on today's hero rig (`player/anim.js` P
channels; the key format is in the header of `duelist/poses.js`). This folder turns motion MEASURED from
the owner's reference footage into those keys, so a boss's punch, kick or cut moves the way the footage
moves while its gameplay (tell, windup, zone, damage, AI) stays exactly as tuned. First tried on Tian Lei,
the Last Ascendant (ADR-208), from a bare-handed attack reference film, and turned down (below).

Never name the reference's game, character or studio anywhere (code, data, commits, docs). Never commit a
reference frame or a picture made from one.

## What exists today

| boss | map | film | blows | verdict |
|---|---|---|---|---|
| Tian Lei | `examples/tianlei.json` (writes `_out/`, not the game) | `fist` (bare-handed attacks, 15:15; specs `fistA.json`, `fistB.json`) | jab, cross, hook, uppercut, backfist, hammer | **turned down by the owner** (2026-11-26): "the new animations look worse than the old ones"; what read as worse: **stiff, unnatural arms** and **the lunges and feet**. Nothing of it plays in the game |

Why it failed, for the next try: (1) the film is a deliberately clumsy brawler (wide wind-ups, off-balance
same-side lunges, spin-throughs): faithful to it reads as sloppier than his authored martial-arts blows;
(2) the footage did not track, so every striking arm was hand-keyed frame by frame from blurred frames:
paths built from a few readings look stiff. Before another boss: pick a reference of CLEAN technique,
filmed steady and slow enough to track (boxing / kung-fu animation sets, fixed side and front cameras), keep
the boss's own stance and footwork unless the reference's is better, and render the result for the owner
before wiring anything (CLAUDE.md "Any change to how something looks").

To play fitted keys on a boss: `realise.js` already takes `keysOf(beat)`; give the boss's blow builders a
`refKeys` from the fitted module and the realiser `keysOf: (b) => switchOn ? b.refKeys : null` behind a look
switch (PR 147's first version did this for Tian Lei: `git show` its commits for the code).

## Setup (once per machine; nothing of it is in the repo)

- Python 3.13 in a venv with `mediapipe` (1.2.x), `opencv-python`, `numpy`, `pillow`; the pose model
  `pose_landmarker_heavy.task` (MediaPipe's pose landmarker, heavy). Point the tool at them with
  `MOCAP_MODEL`, and at the frames / work folder with `MOCAP_REF` / `MOCAP_WORK` (`mlib/cfg.py`); run every
  script as `"$PY" -I`. On the owner's PC (2026-11-26) a working venv and model sat in the hero remake
  session's scratchpad (`.../148948b5eaa20cf5/4b3d9810-.../scratchpad/pose`, `/models`): reuse them while they
  exist, scratchpads get cleared.
- Heavy jobs (tracking, a film take, a test run) take the shared one-at-a-time lock (`lock.sh` in the
  hero remake's work folder; a lock older than 12 minutes counts as dead, so keep one job under 8).
- Recording: a headless Edge (`--headless=new --remote-debugging-port=<p> --autoplay-policy=no-user-gesture-required
  --mute-audio`), a CDP client that sets `hd1080`, saves frames from `requestVideoFrameCallback`, skips
  `.ad-showing` frames and restarts after a stall from the last saved time. Close the browser the moment the
  film is complete (autoplay: see the lessons).

## The pipeline, end to end

```
footage ──(1 record)──▶ frames on disk ──(2 catalogue)──▶ takes and strike times
        ──(3 track + build, scripts/mocap)──▶ a hero2 clip (24-joint skeleton, src/entities/hero2/clips/<set>.js)
        ──(4 fit, this folder)──▶ the boss's blow keys (a generated module the boss imports)
        ──(5 the boss's builders)──▶ beat.refKeys, played behind a look switch through realise.js `keysOf`
```

1. **Record** the video frame by frame (a headless Edge on a CDP port playing the page; a recorder
   that saves each `requestVideoFrameCallback` frame as `t<seconds>.jpg`, waits out ads and resumes
   after a stall). YouTube's page data has the chapter list (`ytInitialData` → `macroMarkersListItemRenderer`).
   Frames live OUTSIDE the repo (a scratchpad folder).
2. **Catalogue** every strike: which limb and kind, stance, 2 - 4 clean takes from different sides (no
   camera cut inside a take), and in the best side take the video times of `start` (the windup moves),
   `cock` (the chamber fullest), `impact` (full extension / contact) and `end` (settled). Crop contact
   sheets at 1/15 s round each strike are the way to read them; this is the expensive, eye-heavy step
   (give it to a subagent and keep the sheets out of the lead's context).
3. **Track and build** the strike as a clip with the mocap tool (`scripts/mocap/README.md`): track the
   takes (HEAVY, under the shared lock), write the clip in a spec (`specs/<set>.json`: kind `oneshot`,
   fps 60, `phases` and a `hit` event at the catalogue's times, `face: "hit"`), `build.py`, read the pair
   sheet, fix the spec (hand keys where the tracker loses a fast arm), until the checker is green.
4. **Fit** the clip onto the boss: write the blow in a map (below) and run
   `node scripts/mocap/duelist/fit.mjs scripts/mocap/duelist/<map>.json [blow ...] --check`.
   `--check` poses today's rig with every key through the REAL animator and prints how far our elbows,
   fists, knees and ankles land from the retargeted reference. Expect fists within ~5 cm, elbows within
   ~10 (the arm IK's soft reach keeps a bend), knees ~5, ankles ~1.
5. **Play** them: the boss's blow builders attach the measured keys as `refKeys` on the beat
   (Tian Lei: `ascendant/moves.js` `refKeys()`), and the boss's realiser gets
   `keysOf: (beat) => switchOn ? beat.refKeys : null` (`duelist/realise.js`). Same beats, same
   timings, other poses; the switch flips live from the next move.

## The retarget (fit.mjs)

Per sampled frame, in the clip's root frame at the IMPACT, its travel taken out (a duelist's root motion is
the beat's `close` / `dash` / `lift`, never the keys):

| duelist channel | from the reference |
|---|---|
| `pitch yaw roll` (the body) | the pelvis' world orientation (YXZ Euler: the rig's joints turn in YXZ, `model.js joint()`) |
| `hipX hip hipZ` | 0 (the pelvis rides on the body) |
| `spX spY spZ` | pelvis → ribcage |
| `hdX hdY hdZ` | ribcage → head |
| `bX bY bZ` | the hip joints' middle, scaled by leg length onto ours |
| `rH lH` (+ `rP lP`) | OUR shoulder + the reference's upper-arm and forearm DIRECTIONS at our bone lengths: the arm's angles are kept exactly; offsets in body axes from the hand's anchor (the right hand's is `DIM.gripShoulder`); the elbow pole is where its elbow sits off the shoulder-hand line |
| `rF lF` (+ `rK lK`, `rFy lFy`) | the ankles scaled (a planted ankle at our `DIM.ankle`), the knee's bend, the foot's heading heel → toe |

The time map: `start → u 0`, `cock → u cock` (the map's `u_cock`, default 0.7; the boss's builder moves
it onto each beat's own cock), `impact → u 1`, `end → u 2` (the beat's follow-through clock). Keys every
`every: [windup, strike, follow]` frames (default 6, 3, 5 at 60 fps); the strike's keys ease in (`e: 'i'`),
the impact's is linear; keys in the first half of the windup are `gather` (left out when a beat follows
another: the last blow's follow-through is then the draw, realise.js).

## The map (`<boss>.json`)

```json
{
  "out": "src/entities/enemies/<boss>/refBlows.js",
  "blows": {
    "jab": { "set": "fistOne", "clip": "light1", "start": 0, "cock": 21, "impact": 30, "end": 48,
             "mirror": false, "u_cock": 0.7, "every": [6, 3, 5], "turn": 0, "note": "..." }
  }
}
```

| key | meaning |
|---|---|
| `set`, `clip` | the clip set module (`src/entities/hero2/clips/<set>.js`) and the clip's name |
| `start cock impact end` | clip FRAMES (or `"0.35s"`); defaults: 0, the clip's `phases.windup`, its `hit` event, impact + 0.3 s |
| `mirror` | true: the reference throws it with the other limb than the boss's authoring (Tian Lei authors orthodox: the LEFT foot leads, the jab is the LEFT hand, the cross / hook / uppercut the RIGHT) |
| `turn` | degrees added to the frame the keys are read in (to aim a blow that lands off his +Z) |
| `skip` | true: listed but not fitted (no usable clip yet) |

A run with blow names refits only those and keeps the others from the last written file.

## Lessons (read before a new boss or a new film)

- The tracker is weakest exactly where melee lives: inside a fast strike the arms blur and swap. Read the
  pair sheet through the strike frame by frame; hand-key the striking arm (`keys` / `drop` on the take,
  `scripts/mocap/README.md` "Hand keys") rather than trusting it.
- Pick takes where the camera does not cut or swing through the strike; a reference that films each move
  from a fixed side, front and back camera gives the best fusion.
- The bare-handed film (ADR-208) did NOT fuse: its follow cameras swing, the passes of a combo are not the
  same performance, and at 30 - 60 captured frames a second the 70 - 100 ms of a strike may hold one or two
  frames. Every one of Tian Lei's six blows is ONE take with the striking arm hand-keyed through the strike;
  check a take's frame times round the impact before choosing it (a capture gap there leaves nothing to read).
- Hand keys for an arm: `scripts/mocap/armkeys.py` turns arm directions read in HIS CHEST frame
  ([left, up, forward] per key frame) into `pose_keys` on every frame. Dense `pose_keys` on a fast arm are
  bridged by the second despike pass unless every frame is keyed (blend 1) and the clip carries a `qa`
  step limit with its reason.
- 2D take `keys` only apply inside a `drop` span (mlib/keys.py). Keying `hipL` / `hipR` there rescaled the
  whole skeleton: leave the hips to the tracker.
- `face: "hit"` needs a blade. For a fist, give `face` in degrees and check the fist lands along +Z at the
  impact; his facing over the first 0.2 s (the fallback) was 40 - 110 degrees off for spinning strikes.
- The film's `src` must start with its film id (`check.mjs` knows `move`, `sword`, `fist`).
- The recorder: close the headless browser as soon as a film is complete. YouTube autoplays the next video,
  and a recorder still attached wrote ~18 000 frames of it under the first film's times (found by the
  frames' write times; every frame newer than the capture's end was deleted and the span re-tracked).
- Tracking runs at 7 - 15 frames a second on this PC (one job at a time under the shared lock): track only
  the takes a clip uses, never whole chapters, and never while a capture is playing.
- The fit keeps ANGLES, not positions, for the arms: a reference with longer arms still lands our fists
  at our reach. Feet keep positions (scaled), so stances keep their width and stride.
- The boss's gameplay never moves: tells, windups, zones and damage stay in its tuning; only poses change.
  Its tests should prove it (`tests/integration/asc.mjs . fists`: timings identical on and off).
- Keep every new animation behind a look switch (`duelist/lookSwitch.js`, a Lab LOOKS row, `PENDING` until
  the owner picks) and render it for the owner before it becomes the default.
