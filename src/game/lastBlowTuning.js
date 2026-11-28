// THE LAST BLOW's numbers (game/lastBlow.js; `?lastBlow=`; ADR-272): the close, low shot of the blow that
// takes a boss's health to zero. Camera and time only: no grade, no dim, no colour.
//
// MODES: the variants the owner picks from. Each differs from its neighbour in ONE thing:
//   a  a hard cut in and out, a short hold (0.8 s)
//   b  a hard cut in and out, the film's long hold (2 s)            (b vs a: the hold)
//   c  a cut to the shot further back, a fast dolly in (and out), the long hold (2 s)   (c vs b: the move)
//   off  today: no shot (the default until the owner picks)
//
//   hold     real s the shot owns the camera, the clock and the hero (the push / pull is inside it: the
//            hero is never out of control longer than this)
//   push     real s of the dolly in (and, the same, out) for a push; 0 = a hard cut
//   from     the push starts this many times the shot's distance back along its own line of sight (that
//            place passes the same rules, or one halfway; never a move from the game camera: from 36 m up
//            it swept down through the courtyard's pillars on film)
//   slow     [at the cut, at the end] the time scale: deepest at the contact, easing up as he falls
//
// FRAMING: per level (the boss's own needs), merged over DEFAULT:
//   pitch    rad the camera looks down at the pair (the game camera's is 58 deg; low = small)
//   yaw      rad off the side-on view toward the hero's back (he is the nearer one: who strikes)
//   fill     the share of the view's half-width (and half-height) the pair may fill
//   dMin, dMax   m from the pair's middle the camera stands at least / at most (dMax too short to fit
//            them both: the shot is skipped, today's camera plays on)
//   heroY, heroR   the hero's subject: his chest (m above his feet) and the sphere kept in frame
//   bossR    the boss's subject sphere (m) when his own is smaller (the duelists: the chest, `lockPoint`)
//   contact  frame the point where the blow met him (kept where it landed) instead of his chest: a boss too
//            big to fit beside the hero up close (the wyrm). A blow with no point (a returned shot): his chest
//   maxGap   m between the hero and the contact beyond which there is no "two fighters" shot: skipped
//   floor    m the camera stays above the hero's feet at least (never under the floor)
//   clear    m the camera stays off any collider, the boss's body and the arena's edge (where it is placed)
//   keep     m the boss's body may come to the camera while it holds: nearer, the shot cuts back at once
//   bodyR    a boss with a rig of named points (the wyrm): each point as a sphere of this radius in the
//            body checks (its hurt spheres go as it dies); 0 = none
//   fall     the side the boss falls to as he dies (1: his right, -1: his left, 0: straight down): the
//            camera stands on the other side first
//   skip     true: this boss never takes the shot (today's behaviour), with the reason in `why`
//   window   real s between the hero's last landed blow and the death for it to count as the killing blow
//            (a Lab kill, a burn: no blow of his, no shot)

const DEG = Math.PI / 180;

export const LAST_BLOW_MODES = Object.freeze({
  a: Object.freeze({ hold: 0.8, push: 0, from: 1, slow: [0.2, 0.85] }),
  b: Object.freeze({ hold: 2.0, push: 0, from: 1, slow: [0.2, 0.85] }),
  c: Object.freeze({ hold: 2.0, push: 0.32, from: 1.8, slow: [0.2, 0.85] }),
});
export const LAST_BLOW_OPTS = Object.freeze(['off', ...Object.keys(LAST_BLOW_MODES)]);
/** The default until the owner picks from the films: today (no shot). */
export const LAST_BLOW_DEFAULT = 'off';

const DEFAULT = Object.freeze({
  pitch: 14 * DEG,
  yaw: 12 * DEG, // (28 deg stacked the pair in depth: side-on, they stand apart on the screen)
  fill: 0.66,
  dMin: 3.4,
  dMax: 11,
  heroY: 1.05,
  heroR: 1.05,
  bossR: 1.1,
  contact: false,
  maxGap: 6,
  floor: 0.9,
  clear: 1.3,
  keep: 0.8,
  bodyR: 0,
  fall: 0,
  skip: false,
  why: '',
  window: 0.35,
  lambda: 5, // 1/s: the shot follows the pair (he falls, the hero steps out of his swing)
});

const level = (o) => Object.freeze({ ...DEFAULT, ...o });

export const LAST_BLOW_FRAMING = Object.freeze({
  DEFAULT,
  // the wyrm: too big to fit beside the hero up close (its chest 5 m up put the camera 16 m out and the
  // hero at a fifth of the frame): the hero and the contact, from low and looking a little up, its body
  // looming over them. It rolls onto its right side as it dies (head and far wing swing 4 - 7 m that
  // way: measured): the camera stands on its left, and cuts back if its body still comes near
  cinderwood: level({ contact: true, bossR: 1.2, pitch: -5 * DEG, floor: 0.7, dMax: 12, maxGap: 9, fill: 0.6, bodyR: 2.4, fall: 1, keep: 1.2 }),
  // the human duelists: the default two-shot
  ash: level({}),
  starless: level({}),
  ring: level({}),
  grove: level({}),
  code: level({}),
  // the fox's paper selves stand round him: the shot keeps to the pair (the selves may cross it)
  fox: level({}),
  // Halcyon flies: in the air when he falls the pair spans more height, so the shot may stand further
  city: level({ dMax: 14, maxGap: 9 }),
  // Bai Wuji's barrier is invisible (only a patch shows where a cut lands): the default two-shot
  veil: level({}),
});

export const lastBlowFraming = (id) => LAST_BLOW_FRAMING[id] ?? DEFAULT;
