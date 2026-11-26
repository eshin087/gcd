# hero2: the remade hero (experiment, `?hero=new`)

A second hero beside today's (`src/entities/player/`), built to play RECORDED clips taken from the
owner's reference footage instead of posing by formula. Today's hero, its animator (`player/anim.js`)
and every boss that shares it are untouched; nothing here is on unless the switch is.

| file | what | owner |
|---|---|---|
| `skeleton.js` | joints, parents, rest pose, `createPose`, `solveFK` (the contract) | lead |
| `dims.js` | `HDIM`, the build's measurements | lead (numbers from the measurement) |
| `clips/*.js` | clip sets, one file per category (format below) | one author each |
| `clips/index.js` | the registry: set files in the reference's order | engine |
| `engine.js` (+ helpers) | clip sampling, blending, time fitting, foot contact, the animator | engine |
| `body.js` (+ helpers) | the drawn body on the skeleton, cloth, the sword | body |
| `showcase.js` | the review mode: plays any clip in a real level, close camera or game camera | engine |
| `horse/` | the mount: its own skeleton, body and clips, played by the same engine | horse |

## Clip format

A clip set is a module: `export default { set: '<id>', title: '<chapter group>', clips: [ clip, ... ] }`
with the clips in the order the reference shows them. One clip:

```js
{
  name: 'walk',                 // unique in the whole registry, camelCase
  title: 'Walk',                // the reference chapter's name, as shown in the review film
  src: 'move 0:32-0:54',        // which footage and when (video id: 'move' | 'sword'); never the game's name
  fps: 30,                      // 30, or 60 for fast attacks
  n: 48,                        // frames
  loop: true,                   // frame n wraps to frame 0 (a loop's last frame is NOT a copy of its first)
  joints: null,                 // null = all J joints in order; or the list of joint indices `q` holds
                                //   (a joint left out stays at its rest rotation; weaponL is usually left out)
  q: '<base64 Int16>',          // n * joints * 4, local quaternions x y z w, each * 32767
  hips: '<base64 Float32>',     // n * 3, the hips in the root's frame
  root: '<base64 Float32>',     // n * 3: x, z, yaw of the root in the clip's own frame; frame 0 = 0, 0, 0
                                //   (a loop's root keeps travelling: the engine reads the per-frame step)
  speed: 1.4,                   // loops that travel: mean ground speed, m/s (else omit)
  contact: { L: [[0, 20]], R: [[24, 44]] },   // frame spans a foot is planted (the engine pins it)
  phases: { windup: 14, active: 22, recover: 31 },  // attacks: the frame the windup ends (the coil),
                                //   the frame the cut ends, the frame he is free to act again
  events: [{ f: 18, name: 'hit' }, { f: 6, name: 'step' }],   // hit = the blade meets the target
  props: { R: 'sword', L: null },   // what the sockets hold: 'sword' | 'flask' | null
  from: 'idle', to: 'idle',     // the pose family it starts from / ends in (blend partners)
}
```

Rules: quaternions are unit and continuous (no sign flips between frames); a planted foot does not slide
in the data (the builder cleans it); the hips' height puts a planted foot's ankle `HDIM.ankle` above the
ground; a clip starts and ends in a pose of its `from` / `to` family so blends are short.
