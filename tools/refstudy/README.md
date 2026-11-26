# refstudy: learn from the owner's reference footage

The kit for turning a reference video into measured motion, then filming OUR game at the game camera to
compare. Method and taste rules: `docs/MOTION.md`. Never name the source game in code, docs or commits
("the owner's reference footage"); never commit a reference frame (keep every output in a scratch folder
outside the repo; `OUT=` below).

## 1. Get the footage (grab.mjs, edge.sh)
```bash
bash tools/refstudy/edge.sh 9431 "$SCRATCH/edge-ref" &        # headless Edge; pick a port nobody uses
export CDP_PORT=9431 OUT="$SCRATCH/ref"
node tools/refstudy/grab.mjs nav "https://www.youtube.com/watch?v=<id>"
node tools/refstudy/grab.mjs play      # playVideo(), waits for readyState>=2 and no .ad-showing
node tools/refstudy/grab.mjs hd        # 1080p
node tools/refstudy/grab.mjs info      # title, duration, size, quality
node tools/refstudy/grab.mjs grab parry 13.2 14.0 0.0333 640 0.85 0.25 0.2 0.5 0.6   # dir t0 t1 step width quality [cx cy cw ch: 0-1 crop]
python -I tools/refstudy/sheet.py "$OUT/parry" "$OUT/parry.jpg" 8 320                    # time-labelled contact sheet
```
About 3.4 frames/s at 1080p (seek + canvas.toDataURL over CDP). Coarse pass first (step 0.25 s over the whole
span), then a fine pass (1/30 or 1/60 s) with a crop round the action. Read the sheet with the Read tool.
Traps: without `--enable-gpu --ignore-gpu-blocklist` the video never decodes; a mid-video ad pauses everything
(`play` waits it out); a fetch from the YouTube tab to localhost hangs on Chrome's local-network prompt, so
frames come back through CDP, not HTTP; CDP ports 9408-9425 belong to other sessions.

## 2. Film OUR game at the game camera (serve.mjs, nav.mjs, run.mjs, take.js, review.sh)
```bash
PORT=5251 OUT="$SCRATCH/film" node tools/refstudy/serve.mjs .      # this checkout + /__scratch/ (= tools/refstudy) + POST /__film/*
bash tools/refstudy/edge.sh 9433 "$SCRATCH/edge-film" &
CDP_PORT=9433 DEV_PORT=5251 node tools/refstudy/run.mjs myclip "level=ash" 6   # load frozen, then take(name, opts)
bash tools/refstudy/review.sh "$SCRATCH/film/out/myclip.mp4" "$SCRATCH/film/out/myclip-review.mp4" 640 360
```
- `nav.mjs` loads the page frozen: `requestAnimationFrame` blocked and `Math.random` seeded from the first
  script, so the game moves only on `__tick(1/60, n)` and every take replays identically.
- `take.js` is an EXAMPLE (the Ash Disciple's thrust, a perfect parry; the third argument is the streak): copy
  it to a new file, keep its skeleton (set up, aim, `T(1)` per frame, draw `g.renderer.domElement` into a
  1280x720 canvas, POST each JPEG to `/__film/frame`), select it with `TAKE=mytake.js`.
- `review.sh` = full frame 960x540 beside a 3x inset round (cx, cy), then a 4x slow copy. Judge impacts from
  the slow copy and a 60 fps strip: a hit-stop runs time at 2 %.
- Compare with the reference: `sheet.py` on both, same crop, same times.

## 3. Traps (each cost a session)
- `main.js` re-aims from the mouse every frame (`updateMouseGround`): setting `game.mouseGround` alone does
  nothing. Re-write `input.mouse` (project the target) or set `p.yaw` toward the boss every frame until the
  press; lock on with `player._setLock(true)` for duels.
- `p.debug.teleport(boss + sin/cos(p.yaw) * dist)` puts the boss in front or behind depending on yaw: log the
  yaw gap before triggering. Put the pair side-on to the camera (the hero behind the boss hides him).
- A parry is virtual `Mouse1` (press, release next frame, about 0.1 s before impact).
- The hidden browser pane throttles rAF: never time inputs on rAF; use `__tick`. Cap wait loops and call
  `flow.resume()` in them.
- Two sessions on one port clash: pick a port, check `curl 127.0.0.1:<p>/json` first.
- Heavy work (`npm test`, films, mocap) goes through the shared lock when one exists
  (`bash <h2>/lock.sh <who> <command...>`); ADR-205: the owner games on this PC.
- Stop every Edge, serve.mjs and background process you started before you finish.
- Bash heredocs with an apostrophe in the body break: write a script file instead.
