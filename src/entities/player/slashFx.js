// THE INSTANT SLASH (ADR-240; the owner, 2026-11-26: "use the current production auto attack combo and remove
// the curvy slashes with the instant slashes", for every attack and the flurry). Where the blade passed,
// ONE STRAIGHT LINE hangs for a moment instead of the curved crescent (fx.js `trail`): thin, sharp at both
// ends, white-hot in the middle, cooling the way the arc cools; the eye gets the line, not the swing. Drawn
// with the arc's own strokes (fx.js `|` strokes in the additive pool, its colours), so it is the same ink as
// the arc it replaces. `?slash=arc` (the Lab's `slash` button) draws the crescent as before.
//
// The line IS the blade's cut, and it comes WITH the swing: the blade's drawn point is followed frame by frame;
// on the first frame the swing has ended (the point slows past its fastest step: SWING) the line is
// drawn through where the point was as the swing began and where it is now, carried on past each end. Its
// angle, height and place are the blade's own, from every side. Per attack, from what it is (combat.js defs,
// the look the animator picked):
//   a cut     the chord of the swing (above)
//   a turn    (the picked look's `spin`: the whirl, the rising whirl, Whirling Tempest) three straight cuts
//             round him between points evenly along the swing, drawn together as it ends
//   a thrust  (a clip whose `line` is 'point', or a `thrust` def: the stab, the heavy thrust, the execution)
//             a short streak straight on off the point, along the blade, as the thrust stops
// The look (SLASH): 'light' for a light attack, 'heavy' for a heavy one (`heavy` on the def: the slam, the
// heavies, the charged cleave, One Breath, the execution): the heavy arc's violet, longer and thicker, the
// camera kicked along the cut with a small shake. Nothing on a dead hero, no allocation a frame, no
// Math.random. The lines were first drawn for the instant cuts of ADR-233 (PR 118, closed); this is their
// drawing, driven by the production attacks.
//
// THE DIGIT SLASH (the default, the owner's pick 2026-11-27, ADR-262, `?slash=dline`): the ending line above
// printed as the slice's thin seam of steel digits instead of strokes. `?slash=line` the line in strokes,
// `?slash=arc` the crescent. THE SLICE (`?slash=slice`): no line at all, but the path the blade's point swept, printed as a thin seam of fine digits on the
// picture's grid, gone in ~0.2 s: "his sword cutting the matrix" (the owner). See SLICE below.

import { SWINGS } from './swings.js';
import { DIM } from './model.js';
import { ARC_TONE } from './fx.js';
import * as THREE from 'three';

const _pv = new THREE.Vector3(), _OUT = [0, 0, 0];

/** 'line' (the default: production's instant slash, the owner's call 2026-11-27, ADR-265): the ending slash line in
 *  strokes, laid on the swing (`path`), in its tone (`?slashtone=`); 'dline': the same line printed as the slice's thin
 *  seam of digits (its colour `?slice=`); 'slice': the seam of digits along the blade's path (SLICE); 'arc': the
 *  curved crescent as before. */
export const SLASH_IDS = ['line', 'dline', 'slice', 'arc'];
let slashNow = 'line';
export const slashMode = () => slashNow;
/** Pick the look of every swing's mark; false for an unknown id. */
export function setSlash(m) {
  if (!SLASH_IDS.includes(m)) return false;
  slashNow = m;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('slash') : null;
  if (q) setSlash(q);
}

/** THE ENDING SLASH (the owner, 2026-11-26: "I didn't mean the instant slash is showing the sword swing, it should
 *  show at the end like an ending slash feel"; shown all three places and both timings, they picked enemy, as the
 *  swing ends). Where the line is drawn once the swing has ended, the way the sword crossed the screen:
 *    enemy   across what it hit, centred on the contact; a whiff: a shorter line at the target place (default)
 *    target  through the space ahead of him where the foe stands (END.ahead m out, at the cut's height)
 *    body    across him, centred on his chest
 *    path    on the swing itself (the default, ADR-263): the straight line that best fits the path the blade's point
 *            swept on the screen, through its fast part (PATH), laid where the slice would be: from every side the line
 *            is the swing's own, as the slice is
 *    blade   along the blade's own path (the first instant slash: the chord of the swing)
 *  and when: '0' as the swing ends (default), 'beat' END.beat s later (the 'already cut' beat, the pose held). */
export const PLACE_IDS = ['path', 'enemy', 'target', 'body', 'blade'];
export const BEAT_IDS = ['0', 'beat'];
// (the owner's baseline, 2026-11-26: "combo A with the slash on the enemy", as the swing ends; 2026-11-27, of the digit
// slash: "looks really weird when the character is attacking from the side or facing the camera, the slashes dont
// match the sword swing from those angles ... right now the slice looks good on all angle": `path`, ADR-263)
let placeNow = 'path', beatNow = '0';
export const placeMode = () => placeNow;
export const beatMode = () => beatNow;
export function setPlace(m) {
  if (!PLACE_IDS.includes(m)) return false;
  placeNow = m;
  return true;
}
export function setBeat(m) {
  const id = String(m);
  if (!BEAT_IDS.includes(id)) return false;
  beatNow = id;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q?.get('endslash')) setPlace(q.get('endslash'));
  if (q?.get('endbeat')) setBeat(q.get('endbeat'));
}
/** The ending slash's numbers: `ahead` (m, × his scale) the target place in front of him, `y` the height
 *  range of its middle (m), `len` [light, heavy] its length (m), `thrust` a thrust's, `miss` × the length of
 *  an enemy-placed whiff, `beat` (s) the pause before it in 'beat', `star` (rad) how far a turn's three cuts
 *  are fanned round their middle. */
/** The path line's numbers (`path`): frames moving at least `fast` of the swing's fastest step are fitted (each weighed
 *  by its step²); the line runs over their extent on the screen, carried on `ext` of it past each end, no shorter than
 *  `min` m (× his scale; a thrust's `thrust`) and no longer than the look's `max`; a thrust whose path is shorter than
 *  `short` m on the screen (straight at the camera) is drawn along the blade's own way across the screen instead. */
export const PATH = { fast: 0.35, ext: 0.12, min: 1.0, thrust: 1.2, short: 0.35 };
export const END = { ahead: 1.9, y: [0.55, 1.7], len: [3.6, 5.6], thrust: 2.4, miss: 0.6, beat: 0.12, star: 0, at: 0.2, reveal: 3, step: 1 / 60, front: 0.35, carry: 6 };
// (`front` m: no part of a line is drawn nearer than this in front of him, along his facing (a heavy's line
// across what it hit ran back over and behind him); `carry` 1/s: a whiff's line moves on with him at his own
// speed, slowing at this rate, so his dash never runs past it: the owner, "the heavy attack slash needs to show
// up in front of the player, not behind them as the player moves forward")
/** THE IMPACT (the owner, 2026-11-26: "make the attack animation look better in terms of animation and impact/
 *  feel"): on a landed blow, as its ending slash appears, the camera is thrown along the slash (`kick` m, `shake`)
 *  and a burst of steel sparks sprays along it from the contact (`n` glyph sparks at `speed` m/s along the line,
 *  `out` across it, in the line's colours; `heat` steel heat blobs in the fire field along the line, the cut's
 *  bright scar); [light, heavy]. */
export const IMPACT = {
  kick: [0.07, 0.14], shake: [0.06, 0.18],
  n: [14, 26], speed: [7, 10], out: 2.2, life: [0.12, 0.26], size: [0.09, 0.14],
  heat: [7, 12], heatLife: 0.16, heatSize: 0.32,
};
/** THE SMEAR: through the fast frames of a swing's strike (its active window only, docs/ANIMATION.md 6; the point
 *  moving at least `min` m a frame), the space the
 *  blade swept since the frame before is filled with steel heat in the fire field for `life` s: `n` points up the
 *  blade (from `from` of it to its drawn point) × `sub` steps between the two frames: the swing's blur printed in
 *  the field's small letters (STYLE.md: a blade's trail is heat in the fire field). */
export const SMEAR = { min: 0.16, n: 6, sub: 2, from: 0.3, life: 0.07, size: 0.13, heat: 0.85 };
/** THE SLICE (ADR-262; the owner, 2026-11-26, of the ending line: "very distracting and seems to linger a bit too
 *  long and looks off when attacking from the side. make sure the slice effect is exactly matching the swords
 *  attack swing ... i want the slices to be like a cool matrix ascii of his sword cutting the matrix/universe. make
 *  it subtle and cool"; asked, ~0.2 s, and both colours and both timings to pick from). The path the blade's
 *  drawn point swept, frame by frame (each frame's blade turned onto the next round its base, so the curve is the
 *  swing's own and not a chord), is printed as ONE thin seam of fine digits on the picture's grid: each digit moved
 *  onto its cell of a lattice in the screen's plane, one digit a cell (a line rasterised into the world's print, as
 *  the afterimage's digits stand in rows and columns); one in `drip` drips out of the cut; all gone in `life`.
 *  Laid against his body (his own travel through the swing taken off: the shape is the swing's, from every side)
 *  and carried on at his ground speed (a dash never leaves it behind). Bright where the blade was fast, nothing
 *  where it was slow (`v`). Its colour (`?slice=`): steel (white-blue, default) or green (the matrix); when
 *  (`?slicewhen=`): trace (laid as the blade passes, default) or end (the whole cut at once as the swing ends). A
 *  landed blow: the camera thrown along the blade's way AT the contact, a small spray of sparks there (IMPACT ×
 *  `burst`, `reach` m either side). */
export const SLICE_IDS = ['steel', 'green'];
/** The slice's shape (`?sliceform=`, ADR-263; the owner, 2026-11-27: "do a variation of the slice steel (drawn as the
 *  blade passes) looks more sharp angles instead of being so curvy to make the strike look more sharp and damaging"):
 *    curve  the path as the point swept it (the default)
 *    facet  the path in straight cuts: a new one each time the blade has turned FACET.facet.turn since the last corner,
 *           or the straight cut would leave the point's path by more than `dev` m (× his scale), so a swing prints as
 *           three or four straight strokes meeting at sharp corners
 *    jag    fewer, longer straight cuts (two or three), each carried on FACET.jag.over m past its corners, so they cross
 *           there in points, as strokes of a brush do
 *  Laid as the blade passes, each cut the frame the blade reaches its corner. */
export const SLICE_FORM_IDS = ['curve', 'facet', 'jag'];
export const FACET = { facet: { turn: 0.75, dev: 0.09, over: 0.03 }, jag: { turn: 1.1, dev: 0.16, over: 0.24 } };
let sliceFormNow = 'curve';
export const sliceFormMode = () => sliceFormNow;
export function setSliceForm(m) {
  if (!SLICE_FORM_IDS.includes(m)) return false;
  sliceFormNow = m;
  return true;
}
export const SLICE_WHEN_IDS = ['trace', 'end'];
let sliceNow = 'steel', sliceWhenNow = 'trace';
export const sliceMode = () => sliceNow;
export const sliceWhenMode = () => sliceWhenNow;
export function setSlice(m) {
  if (!SLICE_IDS.includes(m)) return false;
  sliceNow = m;
  return true;
}
export function setSliceWhen(m) {
  if (!SLICE_WHEN_IDS.includes(m)) return false;
  sliceWhenNow = m;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q?.get('slice')) setSlice(q.get('slice'));
  if (q?.get('slicewhen')) setSliceWhen(q.get('slicewhen'));
  if (q?.get('sliceform')) setSliceForm(q.get('sliceform'));
}
/** The slice's numbers: `cell` (m, × his scale) the lattice's cell, and so the digits' spacing; `size` × the cell
 *  a digit's size at birth and death; `life` [light, heavy] (s); `from` × the windup: followed from there on; `v`
 *  (m/s, × his scale) the point's speed that prints nothing … full strength; `alpha` a digit's opacity at full;
 *  `rows` the shares up the blade (its base → its drawn point) of each seam [light, heavy] (a heavy's second seam
 *  inside the first, `inner` × its opacity); one digit in `drip` drips out (`dripV` m/s down, `dripLife` × the
 *  life); `carry` 1/s the rate the carry at his ground speed slows; `flicker` the digits' shimmer. */
export const SLICE = {
  cell: 0.13, size: [1.3, 0.9], life: [0.2, 0.24], from: 0.6, v: [3, 12], alpha: 0.9,
  rows: [[1], [1, 0.72]], inner: 0.5, drip: 5, dripV: [0.6, 1.5], dripLife: 1.35, carry: 4, flicker: 0.35,
  burst: 0.45, reach: 0.35,
};
/** The slice's colours: `hot` its brightest digits (the fastest of the swing), `core` the rest, `end` what they
 *  cool to as they go. */
export const SLICE_COL = {
  steel: { hot: [2.0, 2.3, 3.0], core: [0.75, 1.05, 1.8], end: [0.1, 0.2, 0.6] },
  green: { hot: [1.2, 2.9, 1.4], core: [0.2, 1.5, 0.45], end: [0.02, 0.35, 0.1] },
};
const DIGITS = '0123456789';
// (`at`: the point along the blade, from its base to its drawn point, whose way across the screen is the
// slash's direction: near the hand, so a blade raised overhead with its point back toward the camera still
// reads as the swing does, from where the sword came down to where it went; `reveal` pieces drawn `step` s
// apart, from the swing's start to its end: the slash runs the way the sword did)
const NP = 24; // ending slashes' pieces waiting for their time

/** The line's looks: strokes, their size at the middle (m), life (s) at the ends … the middle, the
 *  four-frame flash, the hairline that outlasts it, the colours (the arc's: white-hot → its core → the
 *  colour it cools to); `ext` the share of the recorded stretch it is carried on past each end, `min` the
 *  shortest line (m), `max` the longest; `rows` strokes side by side (`gap` m apart on the screen's plane;
 *  the outer ones `outer` × the size, in `edge`'s colour); `hold` the share of its size a stroke still has
 *  at the end of its life and `fade` its opacity then; `kick` the camera's kick along the cut (m) and the
 *  shake on the frame it is drawn; `over` (m): carried on no higher than this over the higher of its two
 *  points, × (1 − its steepness²) (a cut straight down never draws a pillar into the sky); `floor` (m) the
 *  line never goes under; `thrust` (m) a thrust's streak; `ring` the turn's cuts. */
export const SLASH = {
  light: {
    n: 30, size: 0.13, life: [0.14, 0.3], flash: { size: 0.19, life: 0.05 }, hair: { size: 0.045, life: 0.95, alpha: 0.7 },
    hot: [3.0, 3.5, 4.3], core: ARC_TONE.light.core, end: ARC_TONE.light.end, ext: 0.35, min: 1.5, max: 4.2,
    rows: 1, gap: 0, outer: 1, hold: 0.12, fade: 0, kick: null, over: 1.6,
  },
  heavy: {
    n: 44, size: 0.2, life: [0.24, 0.42], flash: { size: 0.26, life: 0.05 }, hair: { size: 0.07, life: 1.3, alpha: 0.8 },
    hot: [2.6, 2.6, 3.6], core: ARC_TONE.heavy.core, end: ARC_TONE.heavy.end, ext: 0.6, min: 3.0, max: 7.0,
    rows: 3, gap: 0.07, outer: 0.8, edge: [0.95, 0.32, 2.5], hold: 0.6, fade: 0.25, kick: { m: 0.08, shake: 0.12 }, over: 2.0,
  },
  floor: 0.08,
  thrust: 0.9,
  ring: 3,
};
const LOOKS = ['light', 'heavy'];
/** THE SLASH'S TONE (`?slashtone=`, ADR-265; the owner, 2026-11-27: "give me variations of the slash effect being more
 *  subtle and not so bright"): how loud the instant slash line (`line`) and its landed blow are drawn.
 *    full   as it is (the default until the owner picks)
 *    soft   dimmer (`col` × its colours), a little thinner, no white flash, a short faint hairline; half the sparks
 *    faint  much dimmer and thinner, no flash, no hairline, shorter; a few sparks, no smear
 *    thin   one fine stroke: a hairline of the core colour, a quick fade; no flash, a few sparks, no smear
 *  `col` × the strokes' colours (the hot middle and the outer rows too), `size` × their size, `life` × how long they
 *  last, `flash` the flash drawn, `hair` × the hairline's life (0: none) and `hairA` × its opacity, `alpha` × the
 *  strokes' opacity, `burst` × a landed blow's sparks and heat, `smear` × the blade's blur (0: none). */
export const SLASH_TONE_IDS = ['full', 'soft', 'faint', 'thin'];
export const SLASH_TONE = {
  full: { col: 1, size: 1, life: 1, flash: true, hair: 1, hairA: 1, alpha: 1, burst: 1, smear: 1 },
  soft: { col: 0.55, size: 0.8, life: 0.85, flash: false, hair: 0.45, hairA: 0.55, alpha: 0.85, burst: 0.5, smear: 0.5 },
  faint: { col: 0.33, size: 0.6, life: 0.7, flash: false, hair: 0, hairA: 0, alpha: 0.7, burst: 0.3, smear: 0 },
  thin: { col: 0.5, size: 0.35, life: 0.55, flash: false, hair: 0, hairA: 0, alpha: 0.9, burst: 0.3, smear: 0 },
};
let toneNow = 'full';
export const slashToneMode = () => toneNow;
// (the tone's colours, built when it is picked: no allocation a frame)
const TCOL = { light: {}, heavy: {} };
const _scale = (c, k) => (c ? [c[0] * k, c[1] * k, c[2] * k] : null);
function buildTone() {
  const k = SLASH_TONE[toneNow].col;
  for (const L of LOOKS) {
    const S = SLASH[L], o = TCOL[L];
    o.hot = _scale(S.hot, k);
    o.core = _scale(S.core, k);
    o.end = _scale(S.end, k);
    o.edge = _scale(S.edge ?? S.core, k);
  }
}
/** Pick the tone; false for an unknown id. */
export function setSlashTone(m) {
  if (!SLASH_TONE_IDS.includes(m)) return false;
  toneNow = m;
  buildTone();
  return true;
}
buildTone();
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('slashtone') : null;
  if (q) setSlashTone(q);
}
/** When the line is drawn: the swing is followed from `from` × the windup; its fastest frame is looked for
 *  from `peakFrom` × the windup (the active window on); the swing has ended on the first frame after it whose point moves under `end`
 *  of that (the line is drawn then, with the blade); the line starts where the point was just before the
 *  first frame moving `start` of it; at the latest `late` of the recovery in. (The owner, 2026-11-26: the
 *  lines "look out of place and a bit lagged. it should show as soon as the animation swing ends": they
 *  were drawn at the end of the active window, from the frame before it opened.) */
export const SWING = { from: 0.5, peakFrom: 1, end: 0.8, start: 0.3, late: 0.35, bite: 0.1 };
const NB = 64; // frames of the point kept (a swing from late in its windup to its end)

export class SlashFx {
  constructor(player) {
    this.p = player;
    this.game = player.game;
    this.rec = null; // the attack record the line belongs to
    this.kind = 0; // 0 a cut, 1 a turn, 2 a thrust
    this.look = 0;
    this.st = 0; // 0 following the swing, 2 drawn
    this.T = [0, 0, 0];
    this.H = [0, 0, 0];
    this.buf = new Float32Array(NB * 3); // the point, frame by frame
    this.mid = new Float32Array(NB * 3); // … and the blade near the hand (END.at): the swing's way on the screen
    this.spd = new Float32Array(NB); // … and how far it moved that frame
    this.hb = new Float32Array(NB * 3); // … the blade's base (the slice turns each frame's blade onto the next)
    this.vel = new Float32Array(NB); // … the point's speed (m/s)
    this.ps = new Float32Array(NB * 2); // … and where he stood (the slice takes his travel off)
    this.cells = new Set(); // the slice's lattice cells this swing has printed (one digit a cell)
    this.fa = -1; // a sharp slice's last corner (a buffered frame), and the strength of the cut since it
    this.fw = 0;
    this.facetN = 0; // its straight cuts this swing (tests)
    /** Tests: (ax, ay, az, bx, by, bz) as each of a sharp slice's straight cuts is laid (its seam's ends, past the corners). */
    this.onFacet = null;
    this.seamN = 0; // the slice's digits so far (tests)
    this.drips = 0;
    this._dripC = 0;
    this._hitNew = false; // a landed blow this frame (the slice's impact is at the contact)
    /** Tests: (x, y, z, w, row) as each of the slice's digits is laid (w its strength 0..1, row its seam). */
    this.onSlice = null;
    this._c = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.2, size: 0.12, sizeEnd: 0.08, glyph: DIGITS, rot: 0, spin: 0, stretch: 0, color: [1, 1, 1], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
    this.nb = 0;
    this.peak = 0; // the fastest frame's step, and its index
    this.pi = -1;
    this.lastT = -1;
    this.pend = new Float32Array(NP * 17); // ax ay az bx by bz, the time it is drawn at, thrust, kick, look, the piece [f0, f1), kind, hit, carry vx vz
    this.hasPrevBlade = false;
    this.pT = [0, 0, 0]; // last frame's blade (the smear)
    this.pH = [0, 0, 0];
    this.smears = 0; // heat blobs the smear printed (tests)
    this.bursts = 0; // contact bursts (tests)
    this._f = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.07, size: 0.12, sizeEnd: 0.05, heat: 0.8, heatEnd: 0, kind: 'steel', drag: 0, gravity: 0 };
    this._s = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.2, size: 0.1, sizeEnd: 0.02, glyph: '|', rot: 0, stretch: 2, color: [3, 3, 3], colorEnd: [0.5, 0.7, 1], alpha: 1, alphaEnd: 0, drag: 4, gravity: 0 };
    this._dly = 0;
    this.np = 0;
    this.hitRec = null; // the attack that landed, and where (the enemy place)
    this.hit = [0, 0, 0];
    player.game?.events?.on?.('player:hitDragon', (e) => {
      const at = this.p.atk, q = e?.point;
      if (!at || !q || !Number.isFinite(q.x + q.y + q.z) || this.hitRec === at) return;
      this.hitRec = at;
      this.hit[0] = q.x;
      this.hit[1] = q.y;
      this.hit[2] = q.z;
      // (the slice's impact on the contact's own frame: the hit test runs after this frame's update; none on a
      // guarded strike, which throws no kick: COMBAT.md, scenario cutfx)
      if (e.guarded) return;
      if (slashNow === 'slice' && this.rec === at && this._blade()) this._sliceHit();
      else this._hitNew = true;
    });
    this.lines = 0; // drawn so far (tests)
    this.last = new Float32Array(8); // the last line drawn: its ends, heavy, the kind (tests)
    this.kicks = 0;
    /** Tests: (ax, ay, az, bx, by, bz, look, kind) as each line is decided. */
    this.onLine = null;
    this._o = { x: 0, y: 0, z: 0, life: 0.2, size: 0.1, sizeEnd: 0.02, glyph: '|', rot: 0, stretch: 1, color: SLASH.light.core, colorEnd: SLASH.light.end, alpha: 1, alphaEnd: 0, drag: 0 };
  }

  /** Does this attack draw its line here (player.js: then no crescent behind the blade)? */
  owns(at) {
    // (a deathblow's swing draws no blade line of its own, neither this line nor the arc: the owner found the
    // big slashes across the screen distracting; the deathblow's hit effect marks the cut, deathblowFx.js)
    if (at?.rip?.db) return true;
    return slashNow !== 'arc' && !!at?.def;
  }

  _blade() {
    const e = this.p.rig?.sword?.matrixWorld?.elements;
    if (!e) return false;
    // (the DRAWN point, model.js: the line sits on the steel the eye sees, not on the hit's reach past it)
    const zt = DIM.drawnTip, zh = DIM.bladeBase, T = this.T, H = this.H;
    T[0] = e[8] * zt + e[12];
    T[1] = e[9] * zt + e[13];
    T[2] = e[10] * zt + e[14];
    H[0] = e[8] * zh + e[12];
    H[1] = e[9] * zh + e[13];
    H[2] = e[10] * zh + e[14];
    return Number.isFinite(T[0] + T[1] + T[2] + H[0] + H[1] + H[2]);
  }

  /** Per frame, after the pose and the sweep (player.js _combat). */
  update() {
    if (this.np) this._flush();
    const P = this.p, at = P.atk, d = at?.def;
    if (slashNow === 'arc' || !(P.hp > 0) || !d || (P.state !== 'attack' && P.state !== 'heavy') || at.pending || at.rip?.db) {
      this.rec = null;
      this._hitNew = false;
      return;
    }
    if (!this._blade()) return;
    if (this.rec !== at) {
      this.rec = at;
      this.hasPrevBlade = false;
      this.st = 0;
      this.nb = 0;
      this.peak = 0;
      this.pi = -1;
      this.lastT = -1;
      // what it is: the look the animator picked (a variant may turn or not)
      const an = P.anim?.atkDef === d && P.anim.atkAnim ? P.anim.atkAnim : d.anim;
      const C = an?.clip ? SWINGS[an.clip] : null;
      this.kind = d.kind === 'thrust' || an?.kind === 'thrust' || C?.line === 'point' ? 2 : an?.spin ? 1 : 0;
      this.look = d.heavy ? 1 : 0;
      this.cells.clear();
      this.fa = -1;
      this.fw = 0;
      this.facetN = 0;
    }
    // (the slice's impact: at the contact, the blade's way then)
    if (this._hitNew) {
      this._hitNew = false;
      if (slashNow === 'slice' && this.hitRec === this.rec) this._sliceHit();
    }
    const W = d.windup, Ac = d.active, R = d.recovery, t = at.t;
    // (the smear: on the strike only, the active window, on a frame that moved; never the anticipation or the
    // recovery: docs/ANIMATION.md 6)
    if (t !== this.lastT && t >= W && t <= W + Ac) this._smear();
    else if (t !== this.lastT) this._keepBlade();
    // (the point is followed from late in the windup; a frozen frame, the hit-pause, moves nothing)
    if (this.st === 2 || t < SWING.from * W || t === this.lastT) return;
    const dtf = this.lastT >= 0 ? t - this.lastT : 0;
    this.lastT = t;
    const T = this.T, B = this.buf, n = this.nb;
    const sp = n > 0 ? Math.hypot(T[0] - B[n * 3 - 3], T[1] - B[n * 3 - 2], T[2] - B[n * 3 - 1]) : 0;
    if (n < NB) {
      B[n * 3] = T[0];
      B[n * 3 + 1] = T[1];
      B[n * 3 + 2] = T[2];
      const H = this.H, M = this.mid, f = END.at;
      for (let c = 0; c < 3; c++) {
        M[n * 3 + c] = H[c] + (T[c] - H[c]) * f;
        this.hb[n * 3 + c] = H[c];
      }
      this.spd[n] = sp;
      this.vel[n] = dtf > 1e-5 ? sp / dtf : 0;
      this.ps[n * 2] = P.position.x;
      this.ps[n * 2 + 1] = P.position.z;
      this.nb = n + 1;
      // the slice, traced: this frame's stretch of the point's path, as the blade passes
      if (slashNow === 'slice' && sliceWhenNow === 'trace' && n > 0 && t >= SLICE.from * W) {
        if (sliceFormNow === 'curve') this._sliceSeg(n - 1, n);
        else this._sliceFacet(n);
      }
    }
    // the swing: its fastest frame from the windup's end on; it has ENDED on the first frame after that
    // peak (the cut proper: from the active window on) whose point moves under SWING.end of it (at the latest SWING.late of the recovery in)
    if (t >= SWING.peakFrom * W && sp > this.peak) {
      this.peak = sp;
      this.pi = this.nb - 1;
    }
    // (not while a landed blow's bite holds the blade, anim.js BITE: the hit-pause and the bite slow it for a
    // few frames at the contact; read as the swing's end, the line came at the contact from the windup's last
    // motion only: a chop's raise drew its line upward)
    const biting = at.hitAt >= 0 && t - at.hitAt < SWING.bite;
    const ended = !biting && this.pi >= 0 && this.nb - 1 > this.pi && sp < SWING.end * this.peak;
    if (!ended && t < W + Ac + SWING.late * R && this.nb < NB) return;
    this.st = 2;
    if (!(this.peak > 0)) return;
    // the cut: from the first frame moving at least SWING.start of its fastest step (the bite's slow frames inside it
    // count, weighed by speed) to where the point is now
    let s = 0;
    while (s < this.pi && this.spd[s] < SWING.start * this.peak) s++;
    const a = Math.max(0, s - 1), e = this.nb - 1;
    if (slashNow === 'slice') {
      this._sliceEnd(a, e);
      return;
    }
    if (placeNow === 'path') {
      // the line on the swing's own path (a turn: three, one on each third of it)
      if (this.kind === 1) {
        // (the kick rides the first cut actually drawn: one behind him is not)
        const k = SLASH.ring;
        let kk = true;
        for (let j = 1; j <= k; j++) {
          const i0 = Math.round(a + ((e - a) * (j - 1)) / k), i1 = Math.round(a + ((e - a) * j) / k);
          if (i1 > i0 && this._pathLine(i0, i1, false, kk, (j - 1) * END.reveal * END.step)) kk = false;
        }
      } else this._pathLine(a, e, this.kind === 2, true, 0);
      return;
    }
    if (this.kind === 2) this._streak(SLASH.thrust * (this.look ? 1.4 : 1));
    else if (this.kind === 1) {
      // a turn: three straight cuts between points evenly along the stretch
      const k = SLASH.ring;
      for (let j = 1; j <= k; j++) {
        const i0 = Math.round(a + ((e - a) * (j - 1)) / k), i1 = Math.round(a + ((e - a) * j) / k);
        if (i1 > i0) this._swing(i0, i1, j === 1, (j - 1) * END.reveal * END.step);
      }
    } else this._swing(a, e, true, 0);
  }

  /** The slice's stretch from buffered frame i0 to i1 (SLICE): the point's path between the two frames, each
   *  frame's blade turned onto the next round its base (the curve the point drew, not the chord), both where they
   *  stand against him now; a digit on each lattice cell it crosses, for each of the look's seams. */
  _sliceSeg(i0, i1) {
    const P = this.p, S = SLICE, sc = P.drawScale || 1, hv = this.look ? 1 : 0;
    const w = Math.min(1, Math.max(0, (this.vel[i1] / sc - S.v[0]) / (S.v[1] - S.v[0])));
    if (!(w > 0) || !this.p.fx?.add?.spawn) return;
    const B = this.buf, Hb = this.hb, PS = this.ps, px = P.position.x, pz = P.position.z;
    const o0x = px - PS[i0 * 2], o0z = pz - PS[i0 * 2 + 1], o1x = px - PS[i1 * 2], o1z = pz - PS[i1 * 2 + 1];
    const h0x = Hb[i0 * 3] + o0x, h0y = Hb[i0 * 3 + 1], h0z = Hb[i0 * 3 + 2] + o0z;
    const h1x = Hb[i1 * 3] + o1x, h1y = Hb[i1 * 3 + 1], h1z = Hb[i1 * 3 + 2] + o1z;
    let u0x = B[i0 * 3] + o0x - h0x, u0y = B[i0 * 3 + 1] - h0y, u0z = B[i0 * 3 + 2] + o0z - h0z;
    let u1x = B[i1 * 3] + o1x - h1x, u1y = B[i1 * 3 + 1] - h1y, u1z = B[i1 * 3 + 2] + o1z - h1z;
    const l0 = Math.hypot(u0x, u0y, u0z), l1 = Math.hypot(u1x, u1y, u1z);
    if (!(l0 > 1e-4 && l1 > 1e-4)) return;
    u0x /= l0;
    u0y /= l0;
    u0z /= l0;
    u1x /= l1;
    u1y /= l1;
    u1z /= l1;
    const chord = Math.hypot(h1x + u1x * l1 - h0x - u0x * l0, h1y + u1y * l1 - h0y - u0y * l0, h1z + u1z * l1 - h0z - u0z * l0);
    const steps = Math.min(48, Math.max(1, Math.ceil(chord / (S.cell * sc * 0.5))));
    const rows = S.rows[hv];
    for (let r = 0; r < rows.length; r++) {
      const f = rows[r];
      for (let k = 0; k <= steps; k++) {
        const b = k / steps, ib = 1 - b;
        let ux = u0x * ib + u1x * b, uy = u0y * ib + u1y * b, uz = u0z * ib + u1z * b;
        const ul = Math.hypot(ux, uy, uz);
        if (!(ul > 1e-4)) continue;
        const l = ((l0 * ib + l1 * b) * f) / ul;
        this._sliceCell(h0x * ib + h1x * b + ux * l, h0y * ib + h1y * b + uy * l, h0z * ib + h1z * b + uz * l, w, r);
      }
    }
  }

  /** A sharp slice (FACET), frame n: the corner is where the blade has turned the form's `turn` since the last one; the
   *  straight cut from the last corner to here is laid then. A slow frame (under SLICE.v[0]) ends the cut there. */
  _sliceFacet(n) {
    const S = SLICE, F = FACET[sliceFormNow] ?? FACET.facet, sc = this.p.drawScale || 1;
    const w = Math.min(1, Math.max(0, (this.vel[n] / sc - S.v[0]) / (S.v[1] - S.v[0])));
    if (this.fa < 0) {
      if (w > 0 && n > 0) {
        this.fa = n - 1;
        this.fw = w;
      }
      return;
    }
    if (!(w > 0)) {
      if (n - 1 > this.fa && this.fw > 0) this._facetCut(this.fa, n - 1, this.fw);
      this.fa = -1;
      this.fw = 0;
      return;
    }
    this.fw = Math.max(this.fw, w);
    // the blade's turn since the corner (its direction, base → point; his travel moves both ends alike)
    const B = this.buf, Hb = this.hb, a = this.fa;
    const ax = B[a * 3] - Hb[a * 3], ay = B[a * 3 + 1] - Hb[a * 3 + 1], az = B[a * 3 + 2] - Hb[a * 3 + 2];
    const bx = B[n * 3] - Hb[n * 3], by = B[n * 3 + 1] - Hb[n * 3 + 1], bz = B[n * 3 + 2] - Hb[n * 3 + 2];
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
    if (!(la > 1e-4 && lb > 1e-4)) return;
    const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb))));
    if (turn >= F.turn) {
      this._facetCut(a, n, this.fw);
      this.fa = n;
      this.fw = w;
      return;
    }
    // (the straight cut corner → here would leave the point's path between them: the corner is the frame before)
    if (n - a < 2) return;
    const PS = this.ps, px = this.p.position.x, pz = this.p.position.z, lim = F.dev * sc;
    const qx = (i) => B[i * 3] + px - PS[i * 2], qz = (i) => B[i * 3 + 2] + pz - PS[i * 2 + 1];
    const x0 = qx(a), y0 = B[a * 3 + 1], z0 = qz(a), ux = qx(n) - x0, uy = B[n * 3 + 1] - y0, uz = qz(n) - z0, l2 = ux * ux + uy * uy + uz * uz;
    if (!(l2 > 1e-8)) return;
    for (let i = a + 1; i < n; i++) {
      const vx = qx(i) - x0, vy = B[i * 3 + 1] - y0, vz = qz(i) - z0, t = Math.max(0, Math.min(1, (vx * ux + vy * uy + vz * uz) / l2));
      if (Math.hypot(vx - ux * t, vy - uy * t, vz - uz * t) > lim) {
        this._facetCut(a, n - 1, this.fw);
        this.fa = n - 1;
        this.fw = w;
        return;
      }
    }
  }

  /** One straight cut of a sharp slice: buffered frame i0's point to i1's (against his body now), carried on the form's
   *  `over` past both ends (fading there), a digit on each lattice cell it crosses, for each of the look's seams. */
  _facetCut(i0, i1, w) {
    const P = this.p, S = SLICE, sc = P.drawScale || 1, hv = this.look ? 1 : 0, F = FACET[sliceFormNow] ?? FACET.facet;
    if (!this.p.fx?.add?.spawn) return;
    const B = this.buf, Hb = this.hb, PS = this.ps, px = P.position.x, pz = P.position.z;
    const o0x = px - PS[i0 * 2], o0z = pz - PS[i0 * 2 + 1], o1x = px - PS[i1 * 2], o1z = pz - PS[i1 * 2 + 1];
    const rows = S.rows[hv], ov = F.over * sc;
    this.facetN++;
    for (let r = 0; r < rows.length; r++) {
      const f = rows[r];
      const x0 = Hb[i0 * 3] + (B[i0 * 3] - Hb[i0 * 3]) * f + o0x, y0 = Hb[i0 * 3 + 1] + (B[i0 * 3 + 1] - Hb[i0 * 3 + 1]) * f, z0 = Hb[i0 * 3 + 2] + (B[i0 * 3 + 2] - Hb[i0 * 3 + 2]) * f + o0z;
      const x1 = Hb[i1 * 3] + (B[i1 * 3] - Hb[i1 * 3]) * f + o1x, y1 = Hb[i1 * 3 + 1] + (B[i1 * 3 + 1] - Hb[i1 * 3 + 1]) * f, z1 = Hb[i1 * 3 + 2] + (B[i1 * 3 + 2] - Hb[i1 * 3 + 2]) * f + o1z;
      let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const L = Math.hypot(dx, dy, dz);
      if (!(L > 1e-3)) continue;
      dx /= L;
      dy /= L;
      dz /= L;
      if (r === 0) this.onFacet?.(x0 - dx * ov, y0 - dy * ov, z0 - dz * ov, x1 + dx * ov, y1 + dy * ov, z1 + dz * ov);
      const steps = Math.min(64, Math.max(1, Math.ceil((L + 2 * ov) / (S.cell * sc * 0.5))));
      for (let k = 0; k <= steps; k++) {
        const s = -ov + ((L + 2 * ov) * k) / steps;
        // (past a corner the stroke thins out to its point)
        const tip = s < 0 ? 1 + s / Math.max(ov, 1e-6) : s > L ? 1 - (s - L) / Math.max(ov, 1e-6) : 1;
        this._sliceCell(x0 + dx * s, y0 + dy * s, z0 + dz * s, w * (0.35 + 0.65 * tip), r);
      }
    }
  }

  /** One of the slice's digits, moved onto its cell of the screen-plane lattice (none where one already is). */
  _sliceCell(x, y, z, w, row, line = false) {
    const fx = this.p.fx?.add, C = this.game?.camera?.matrixWorld?.elements;
    if (!fx?.spawn || !C || !(y > SLASH.floor) || !Number.isFinite(x + y + z)) return;
    const S = SLICE, sc = this.p.drawScale || 1, cell = S.cell * sc, q = 1 / cell, hv = this.look ? 1 : 0;
    const rx = C[0], ry = C[1], rz = C[2], ux = C[4], uy = C[5], uz = C[6];
    const sx = x * rx + y * ry + z * rz, sy = x * ux + y * uy + z * uz;
    const cx = Math.round(sx * q), cy = Math.round(sy * q);
    const key = (cx & 0xffff) * 65536 + (cy & 0xffff);
    if (this.cells.has(key)) return;
    this.cells.add(key);
    const mx = cx * cell - sx, my = cy * cell - sy;
    x += rx * mx + ux * my;
    y += ry * mx + uy * my;
    z += rz * mx + uz * my;
    const col = SLICE_COL[sliceNow] ?? SLICE_COL.steel, o = this._c, gv = this.p.groundVel;
    o.x = x;
    o.y = y;
    o.z = z;
    // (the ending line's digits: its own carry, nothing on a landed blow's: END.carry)
    o.vx = line ? this._cvx || 0 : Number(gv?.x) || 0;
    o.vy = 0;
    o.vz = line ? this._cvz || 0 : Number(gv?.z) || 0;
    o.drag = line ? END.carry : S.carry;
    o.life = S.life[hv] * (0.75 + 0.25 * w);
    o.size = cell * S.size[0];
    o.sizeEnd = cell * S.size[1];
    o.color = w > 0.8 && row === 0 ? col.hot : col.core;
    o.colorEnd = col.end;
    o.alpha = S.alpha * (0.3 + 0.7 * w) * (row > 0 ? S.inner : 1);
    o.alphaEnd = 0;
    o.flicker = S.flicker;
    fx.spawn(o);
    this.seamN++;
    this.onSlice?.(x, y, z, w, row);
    // (one in `drip` drips out of the cut: the code spilling from where the world was cut)
    if (row === 0 && ++this._dripC % S.drip === 0) {
      const v = Math.sin(this._dripC * 12.9898) * 43758.5453, h = v - Math.floor(v);
      o.vy = -(S.dripV[0] + (S.dripV[1] - S.dripV[0]) * h);
      o.life *= S.dripLife;
      o.alpha *= 0.55;
      o.size *= 0.9;
      o.color = col.core;
      fx.spawn(o);
      this.drips++;
    }
  }

  /** The slice's impact at the contact (a landed blow): the camera thrown along the blade's way there, a shake,
   *  a small spray of sparks either side of the contact (IMPACT × SLICE.burst). */
  _sliceHit() {
    const T = this.T, B = this.buf, n = this.nb, C = this.game?.camera?.matrixWorld?.elements, g = this.game;
    if (!C) return;
    let dx = 0, dy = 0, dz = 0;
    if (n >= 1) {
      dx = T[0] - B[n * 3 - 3];
      dy = T[1] - B[n * 3 - 2];
      dz = T[2] - B[n * 3 - 1];
    }
    if (!(Math.hypot(dx, dy, dz) > 1e-4) && n >= 2) {
      dx = B[n * 3 - 3] - B[n * 3 - 6];
      dy = B[n * 3 - 2] - B[n * 3 - 5];
      dz = B[n * 3 - 1] - B[n * 3 - 4];
    }
    // (in the screen's plane: the picture thrown the way the blade crossed it)
    if (!this._screen(dx * C[0] + dy * C[1] + dz * C[2], dx * C[4] + dy * C[5] + dz * C[6])) return;
    const D = _OUT, ux = D[0], uy = D[1], uz = D[2], hv = this.look ? 1 : 0, H = this.hit, r = SLICE.reach * (this.p.drawScale || 1);
    g?.kick?.(ux, uy, uz, IMPACT.kick[hv]);
    g?.shake?.(IMPACT.shake[hv]);
    this.kicks++;
    this._burst(H[0] - ux * r, H[1] - uy * r, H[2] - uz * r, H[0] + ux * r, H[1] + uy * r, H[2] + uz * r, ux, uy, uz, hv, SLICE.burst);
  }

  /** The slice's swing has ended (frames a … e): drawn now if it waits for the end; announced (the audio's ring,
   *  `player:slash`; tests: onLine with the path's two ends). */
  _sliceEnd(a, e) {
    if (sliceFormNow !== 'curve') {
      if (sliceWhenNow === 'end') {
        this.fa = -1;
        this.fw = 0;
        for (let i = a + 1; i <= e; i++) this._sliceFacet(i);
      }
      if (this.fa >= 0 && e > this.fa && this.fw > 0) this._facetCut(this.fa, e, this.fw);
      this.fa = -1;
    } else if (sliceWhenNow === 'end') for (let i = a + 1; i <= e; i++) this._sliceSeg(i - 1, i);
    const B = this.buf, hv = this.look ? 1 : 0, la = this.last, hit = this.hitRec === this.rec;
    this._hit = hit;
    this.onLine?.(B[a * 3], B[a * 3 + 1], B[a * 3 + 2], B[e * 3], B[e * 3 + 1], B[e * 3 + 2], LOOKS[hv], this.kind);
    for (let c = 0; c < 3; c++) {
      la[c] = B[a * 3 + c];
      la[3 + c] = B[e * 3 + c];
    }
    la[6] = hv;
    la[7] = this.kind;
    this.lines++;
    const H = this.hit, m = ((a + e) >> 1) * 3;
    this.game?.events?.emit?.('player:slash', { heavy: hv === 1, hit, thrust: this.kind === 2, x: hit ? H[0] : B[m], y: hit ? H[1] : B[m + 1], z: hit ? H[2] : B[m + 2] });
  }

  /** Last frame's blade, for the smear (a frame outside the smear's stretch). */
  _keepBlade() {
    const T = this.T, H = this.H;
    for (let c = 0; c < 3; c++) {
      this.pT[c] = T[c];
      this.pH[c] = H[c];
    }
    this.hasPrevBlade = true;
  }

  /** The blade's blur: steel heat over what it swept since last frame, while it moves fast (SMEAR). */
  _smear() {
    const T = this.T, H = this.H, pT = this.pT, pH = this.pH, S = SMEAR, fire = this.game?.fx?.fire;
    const sc = this.p.drawScale || 1, tk = slashNow === 'line' ? SLASH_TONE[toneNow].smear : 1;
    if (tk > 0 && this.hasPrevBlade && fire?.spawn && Math.hypot(T[0] - pT[0], T[1] - pT[1], T[2] - pT[2]) >= S.min * sc) {
      const f = this._f;
      f.life = S.life;
      f.size = S.size * sc;
      f.sizeEnd = S.size * 0.4 * sc;
      f.heat = S.heat * tk;
      f.heatEnd = 0;
      f.kind = 'steel';
      f.vx = f.vy = f.vz = 0;
      for (let j = 0; j < S.n; j++) {
        const a = S.from + ((1 - S.from) * j) / Math.max(1, S.n - 1);
        for (let k = 1; k <= S.sub; k++) {
          const b = k / (S.sub + 1), ib = 1 - b;
          // the point a of the way up the blade, b of the way from last frame's blade to this one's
          const qx = pH[0] + (pT[0] - pH[0]) * a, qy = pH[1] + (pT[1] - pH[1]) * a, qz = pH[2] + (pT[2] - pH[2]) * a;
          const rx = H[0] + (T[0] - H[0]) * a, ry = H[1] + (T[1] - H[1]) * a, rz = H[2] + (T[2] - H[2]) * a;
          f.x = qx * ib + rx * b;
          f.y = qy * ib + ry * b;
          f.z = qz * ib + rz * b;
          if (!(f.y > SLASH.floor) || !Number.isFinite(f.x + f.y + f.z)) continue;
          fire.spawn(f);
          this.smears++;
        }
      }
    }
    this._keepBlade();
  }

  /** A landed blow's burst along its line (IMPACT): glyph sparks thrown both ways along the cut and a little
   *  across it from the line's middle, and a bright scar of steel heat down the line. */
  _burst(ax, ay, az, bx, by, bz, dx, dy, dz, hv, k = 1) {
    const fx = this.p.fx?.add, fire = this.game?.fx?.fire, I = IMPACT, Lk = slashNow === 'line' ? TCOL[LOOKS[hv]] : SLASH[LOOKS[hv]];
    if (slashNow === 'line') k *= SLASH_TONE[toneNow].burst;
    const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2, len = Math.hypot(bx - ax, by - ay, bz - az);
    this.bursts++;
    // (across the line, roughly in the screen's plane: the camera's back axis × the line)
    const C = this.game?.camera?.matrixWorld?.elements;
    let px = 0, py = 1, pz = 0;
    if (C) {
      const qx = dy * C[10] - dz * C[9], qy = dz * C[8] - dx * C[10], qz = dx * C[9] - dy * C[8], ql = Math.hypot(qx, qy, qz);
      if (ql > 1e-6) {
        px = qx / ql;
        py = qy / ql;
        pz = qz / ql;
      }
    }
    // (cosmetic spread from the blow's own count: the seeded sims replay the AI's Math.random)
    const rnd = (i, k) => {
      const v = Math.sin((this.bursts * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453);
      return v - Math.floor(v);
    };
    // (the sparks' strokes turned along the line on the screen, as the line's own)
    let rot = Math.atan2(dy, dx) - Math.PI / 2;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-10) rot = Math.atan2(sy, sx) - Math.PI / 2;
    }
    if (fx?.spawn) {
      const o = this._s, n = Math.round(I.n[hv] * k);
      o.color = Lk.hot;
      o.colorEnd = Lk.end;
      for (let i = 0; i < n; i++) {
        const along = (rnd(i, 1) - 0.5) * 2, sgn = along < 0 ? -1 : 1, sp = I.speed[hv] * (0.45 + 0.55 * Math.abs(along));
        const side = (rnd(i, 2) - 0.5) * 2 * I.out;
        o.x = cx + dx * along * len * 0.15;
        o.y = cy + dy * along * len * 0.15;
        o.z = cz + dz * along * len * 0.15;
        o.vx = dx * sgn * sp + px * side;
        o.vy = dy * sgn * sp + py * side;
        o.vz = dz * sgn * sp + pz * side;
        o.life = I.life[hv] * (0.6 + 0.4 * rnd(i, 3));
        o.size = I.size[hv];
        o.sizeEnd = I.size[hv] * 0.2;
        o.stretch = 3;
        o.rot = rot;
        o.alpha = 1;
        o.alphaEnd = 0;
        o.drag = 5;
        fx.spawn(o);
      }
    }
    if (fire?.spawn) {
      const f = this._f, m = Math.round(I.heat[hv] * k);
      f.life = I.heatLife;
      f.size = I.heatSize;
      f.sizeEnd = I.heatSize * 0.3;
      f.heat = 1.4;
      f.heatEnd = 0;
      f.kind = 'steel';
      f.vx = f.vy = f.vz = 0;
      for (let i = 0; i < m; i++) {
        const s = (i / Math.max(1, m - 1) - 0.5) * len * 0.7;
        f.x = cx + dx * s;
        f.y = cy + dy * s;
        f.z = cz + dz * s;
        if (f.y > SLASH.floor) fire.spawn(f);
      }
    }
  }

  /** A cut from buffered frame i0 to i1: along the blade's point (the `blade` place), or, at every other
   *  place, the way the blade near the hand crossed the screen. */
  _swing(i0, i1, kick, delay) {
    this._dly = delay;
    if (placeNow === 'blade') {
      const B = this.buf;
      this._cut(B[i0 * 3], B[i0 * 3 + 1], B[i0 * 3 + 2], B[i1 * 3], B[i1 * 3 + 1], B[i1 * 3 + 2], kick);
    } else {
      // the cut's way: the blade's steps near the hand, each weighted by the square of the point's speed that
      // frame, so the fast cut decides it and not the quicker part of a raise before it (the chord of the
      // whole stretch ran a chop's line upward: the owner, "the opposite of what is currently displaying")
      // (on the screen, through the camera's own projection: a chop that runs away from the camera moves
      // DOWN the picture, though its depth would lay it upward)
      const M = this.mid, S = this.spd, cam = this.game?.camera;
      if (!cam) return;
      let x = 0, y = 0, px = 0, py = 0;
      for (let i = i0; i <= i1; i++) {
        _pv.set(M[i * 3], M[i * 3 + 1], M[i * 3 + 2]).project(cam);
        if (i > i0) {
          const w = S[i] * S[i];
          x += (_pv.x - px) * w;
          y += (_pv.y - py) * w;
        }
        px = _pv.x;
        py = _pv.y;
      }
      if (this._screen(x * (cam.aspect || 1), y)) {
        const ax = M[i0 * 3], ay = M[i0 * 3 + 1], az = M[i0 * 3 + 2], D = _OUT;
        this._cut(ax, ay, az, ax + D[0], ay + D[1], az + D[2], kick);
      }
    }
    this._dly = 0;
  }

  /** The path line (`path`, PATH): from buffered frame i0 to i1, the point's path against his body now (his own travel
   *  taken off, as the slice's), its fast frames fitted with one straight line in the screen's plane (the principal axis
   *  of their places on the screen, each weighed by its step²), run the way the blade went, over their extent. */
  _pathLine(i0, i1, thrust, kick, delay) {
    const C = this.game?.camera?.matrixWorld?.elements, P = this.p;
    if (!C) return false;
    const B = this.buf, S = this.spd, PS = this.ps, px = P.position.x, pz = P.position.z, sc = P.drawScale || 1;
    const rx = C[0], ry = C[1], rz = C[2], ux = C[4], uy = C[5], uz = C[6];
    let top = 0;
    for (let i = i0 + 1; i <= i1; i++) top = Math.max(top, S[i]);
    if (!(top > 0)) return;
    const cut = PATH.fast * top, sp = (i) => (i > i0 ? S[i] : S[i0 + 1]);
    // the weighed centre (in the world and on the screen), then the spread on the screen
    let W = 0, wx = 0, wy = 0, wz = 0, ms = 0, mt = 0;
    for (let i = i0; i <= i1; i++) {
      const v = sp(i);
      if (!(v >= cut)) continue;
      const w = v * v, x = B[i * 3] + px - PS[i * 2], y = B[i * 3 + 1], z = B[i * 3 + 2] + pz - PS[i * 2 + 1];
      W += w;
      wx += w * x;
      wy += w * y;
      wz += w * z;
      ms += w * (x * rx + y * ry + z * rz);
      mt += w * (x * ux + y * uy + z * uz);
    }
    if (!(W > 0)) return;
    wx /= W;
    wy /= W;
    wz /= W;
    ms /= W;
    mt /= W;
    let css = 0, ctt = 0, cst = 0;
    for (let i = i0; i <= i1; i++) {
      const v = sp(i);
      if (!(v >= cut)) continue;
      const w = v * v, x = B[i * 3] + px - PS[i * 2], y = B[i * 3 + 1], z = B[i * 3 + 2] + pz - PS[i * 2 + 1];
      const ds = x * rx + y * ry + z * rz - ms, dt = x * ux + y * uy + z * uz - mt;
      css += w * ds * ds;
      ctt += w * dt * dt;
      cst += w * ds * dt;
    }
    const th = 0.5 * Math.atan2(2 * cst, css - ctt);
    let ds = Math.cos(th), dt = Math.sin(th);
    // the way the blade went: from the stretch's first frame to its last
    const ex = B[i1 * 3] + px - PS[i1 * 2] - (B[i0 * 3] + px - PS[i0 * 2]), ey = B[i1 * 3 + 1] - B[i0 * 3 + 1], ez = B[i1 * 3 + 2] + pz - PS[i1 * 2 + 1] - (B[i0 * 3 + 2] + pz - PS[i0 * 2 + 1]);
    if ((ex * rx + ey * ry + ez * rz) * ds + (ex * ux + ey * uy + ez * uz) * dt < 0) {
      ds = -ds;
      dt = -dt;
    }
    // its extent along the line
    let s0 = Infinity, s1 = -Infinity;
    for (let i = i0; i <= i1; i++) {
      if (!(sp(i) >= cut)) continue;
      const x = B[i * 3] + px - PS[i * 2] - wx, y = B[i * 3 + 1] - wy, z = B[i * 3 + 2] + pz - PS[i * 2 + 1] - wz;
      const v = (x * rx + y * ry + z * rz) * ds + (x * ux + y * uy + z * uz) * dt;
      s0 = Math.min(s0, v);
      s1 = Math.max(s1, v);
    }
    const Lk = SLASH[LOOKS[this.look]];
    let dx = rx * ds + ux * dt, dy = ry * ds + uy * dt, dz = rz * ds + uz * dt, cx = wx, cy = wy, cz = wz;
    if (thrust && s1 - s0 < PATH.short * sc) {
      // (a thrust straight at the camera: its path is a dot on the screen; along the blade's way across it, off the point)
      const T = this.T, H = this.H, qx = T[0] - H[0], qy = T[1] - H[1], qz = T[2] - H[2];
      if (this._screen(qx * rx + qy * ry + qz * rz, qx * ux + qy * uy + qz * uz)) {
        dx = _OUT[0];
        dy = _OUT[1];
        dz = _OUT[2];
      }
      cx = T[0];
      cy = T[1];
      cz = T[2];
      s0 = 0;
      s1 = PATH.short * sc;
    }
    const len = Math.min(Lk.max * sc, Math.max((thrust ? PATH.thrust : PATH.min) * sc, (s1 - s0) * (1 + 2 * PATH.ext)));
    const mid = (s0 + s1) / 2, h = len / 2;
    // (a thrust's streak runs on past the point: its far end carried further)
    const a0 = thrust ? mid - h * 0.6 : mid - h, a1 = thrust ? mid + h * 1.4 : mid + h;
    this._dly = delay;
    const drawn = this._end(cx + dx * a0, cy + dy * a0, cz + dz * a0, cx + dx * a1, cy + dy * a1, cz + dz * a1, thrust, kick);
    this._dly = 0;
    return drawn;
  }

  /** A direction across the screen (sx right, sy up, in pixels' proportions) as a world direction in the
   *  screen's plane → _OUT; false when there is none. */
  _screen(sx, sy) {
    const C = this.game?.camera?.matrixWorld?.elements, l = Math.hypot(sx, sy);
    if (!C || !(l > 1e-9)) return false;
    sx /= l;
    sy /= l;
    _OUT[0] = C[0] * sx + C[4] * sy;
    _OUT[1] = C[1] * sx + C[5] * sy;
    _OUT[2] = C[2] * sx + C[6] * sy;
    return Number.isFinite(_OUT[0] + _OUT[1] + _OUT[2]);
  }

  /** The line through the point's two places, carried on past both (no shorter than its min), kept off
   *  the ground and under its ceiling. `kick`: this line may kick the camera (a turn's first cut only). */
  _cut(x0, y0, z0, x1, y1, z1, kick) {
    const L = SLASH[LOOKS[this.look]];
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const d = Math.hypot(dx, dy, dz);
    if (!(d > 1e-3)) return;
    dx /= d;
    dy /= d;
    dz /= d;
    const len = Math.min(L.max, Math.max(L.min, d * (1 + 2 * L.ext)));
    const pad = (len - d) / 2;
    let s0 = -pad, s1 = d + pad; // along the line from the first point
    if (Math.abs(dy) > 1e-6) {
      const sF = (SLASH.floor - y0) / dy; // where it meets the floor
      if (dy < 0) s1 = Math.min(s1, sF);
      else s0 = Math.max(s0, sF);
      const sT = (Math.max(y0, y1) + L.over * (1 - dy * dy) - y0) / dy; // where it reaches its ceiling
      if (dy > 0) s1 = Math.min(s1, sT);
      else s0 = Math.max(s0, sT);
    } else if (y0 < SLASH.floor) return;
    if (!(s1 - s0 > 0.2)) return;
    this._end(x0 + dx * s0, y0 + dy * s0, z0 + dz * s0, x0 + dx * s1, y0 + dy * s1, z0 + dz * s1, false, kick);
  }

  /** A thrust: a short streak straight on off the point, along the blade. */
  _streak(len) {
    const T = this.T, H = this.H, cam = this.game?.camera;
    if (placeNow !== 'blade' && cam) {
      // (the blade's way across the screen, through the camera's projection)
      _pv.set(H[0], H[1], H[2]).project(cam);
      const hx = _pv.x, hy = _pv.y;
      _pv.set(T[0], T[1], T[2]).project(cam);
      if (this._screen((_pv.x - hx) * (cam.aspect || 1), _pv.y - hy)) {
        this._end(T[0], T[1], T[2], T[0] + _OUT[0] * len, T[1] + _OUT[1] * len, T[2] + _OUT[2] * len, true, true);
        return;
      }
    }
    let dx = T[0] - H[0], dy = T[1] - H[1], dz = T[2] - H[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    this._end(T[0], T[1], T[2], T[0] + dx * len, T[1] + dy * len, T[2] + dz * len, true, true);
  }

  /** The ending slash: the cut's line (a → b) moved to its place (placeNow) at the cut's angle, kept off the
   *  floor, drawn now or after the beat (beatNow). True when it is drawn or queued. */
  _end(ax, ay, az, bx, by, bz, thrust, kick) {
    if (placeNow !== 'blade' && placeNow !== 'path') {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const l = Math.hypot(dx, dy, dz);
      if (!(l > 1e-4)) return;
      dx /= l;
      dy /= l;
      dz /= l;
      // (laid in the screen's plane: the slash crosses the picture the way the sword did, whatever its
      // depth; a cut toward or away from the camera no longer turns into a stub, or its mirror)
      const C = this.game?.camera?.matrixWorld?.elements;
      if (C) {
        const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6], sl = Math.hypot(sx, sy);
        if (sl > 0.05) {
          dx = (C[0] * sx + C[4] * sy) / sl;
          dy = (C[1] * sx + C[5] * sy) / sl;
          dz = (C[2] * sx + C[6] * sy) / sl;
        }
      }
      const P = this.p, sc = P.drawScale || 1, E = END;
      let cx, cy, cz, L = (thrust ? E.thrust : E.len[this.look]) * sc;
      const ch = P.rig?.chest?.matrixWorld?.elements;
      if (placeNow === 'body' && ch) {
        cx = ch[12];
        cy = ch[13];
        cz = ch[14];
      } else if (placeNow === 'enemy' && this.hitRec === this.rec) {
        cx = this.hit[0];
        cy = this.hit[1];
        cz = this.hit[2];
      } else {
        const y = P.yaw ?? 0;
        cx = P.position.x + Math.sin(y) * E.ahead * sc;
        cz = P.position.z + Math.cos(y) * E.ahead * sc;
        cy = Math.min(E.y[1] * sc, Math.max(E.y[0] * sc, (ay + by) / 2));
        if (placeNow === 'enemy') L *= E.miss;
      }
      if (!Number.isFinite(cx + cy + cz)) return;
      // (a thrust's streak runs on from just behind the place; a cut is centred on it)
      const f0 = thrust ? -0.3 : -0.5, f1 = thrust ? 0.7 : 0.5;
      let s0 = f0 * L, s1 = f1 * L;
      if (Math.abs(dy) > 1e-6) {
        const sF = (SLASH.floor - cy) / dy;
        if (dy < 0) s1 = Math.min(s1, sF);
        else s0 = Math.max(s0, sF);
      } else if (cy < SLASH.floor) return;
      // in front of him: the middle at least END.front ahead along his facing, and no part of the line
      // behind that (the end that runs back is cut off there)
      {
        const yw = P.yaw ?? 0, fx = Math.sin(yw), fz = Math.cos(yw), fr = E.front * sc;
        const dc = (cx - P.position.x) * fx + (cz - P.position.z) * fz;
        if (dc < fr) {
          cx += fx * (fr - dc);
          cz += fz * (fr - dc);
        }
        const k = dx * fx + dz * fz, d0 = (cx - P.position.x) * fx + (cz - P.position.z) * fz; // along the line, ahead per m
        if (Math.abs(k) > 1e-4) {
          const sB = (fr - d0) / k; // where the line comes to END.front ahead of him
          if (k > 0) s0 = Math.max(s0, sB);
          else s1 = Math.min(s1, sB);
        }
      }
      if (!(s1 - s0 > 0.2)) return;
      ax = cx + dx * s0;
      ay = cy + dy * s0;
      az = cz + dz * s0;
      bx = cx + dx * s1;
      by = cy + dy * s1;
      bz = cz + dz * s1;
    }
    if (placeNow === 'path') {
      // (on the swing, nothing behind him either (ADR-244's rule). An end nearer than END.front ahead along his facing is
      // slid along the camera's line of sight to it until it is that far ahead: its place on the picture is the same, so
      // the line stays on the swing (from behind or the front a line across the screen lies at the swing's middle depth,
      // close to him); where that sight runs across his facing (side-on) the part behind him is cut off instead, and none
      // is drawn if all of it is behind)
      const P = this.p, yw = P.yaw ?? 0, fx = Math.sin(yw), fz = Math.cos(yw), fr = END.front * (P.drawScale || 1);
      const C = this.game?.camera?.matrixWorld?.elements, ox = P.position.x, oz = P.position.z;
      const slide = (o) => {
        const x = o === 0 ? ax : bx, y = o === 0 ? ay : by, z = o === 0 ? az : bz, d = (x - ox) * fx + (z - oz) * fz;
        if (d >= fr || !C) return d;
        let rx = x - C[12], ry = y - C[13], rz = z - C[14];
        const rl = Math.hypot(rx, ry, rz);
        if (!(rl > 1e-4)) return d;
        rx /= rl;
        ry /= rl;
        rz /= rl;
        const rf = rx * fx + rz * fz;
        if (Math.abs(rf) < 0.25) return d;
        const t = (fr - d) / rf;
        if (!(rl + t > 0.5)) return d;
        if (o === 0) {
          ax += rx * t;
          ay += ry * t;
          az += rz * t;
        } else {
          bx += rx * t;
          by += ry * t;
          bz += rz * t;
        }
        return fr;
      };
      const da = slide(0), db = slide(1);
      if (!(da >= fr - 1e-6 || db >= fr - 1e-6)) return false;
      if (da < fr - 1e-6) {
        const t = (fr - da) / (db - da);
        ax += (bx - ax) * t;
        ay += (by - ay) * t;
        az += (bz - az) * t;
      } else if (db < fr - 1e-6) {
        const t = (fr - db) / (da - db);
        bx += (ax - bx) * t;
        by += (ay - by) * t;
        bz += (az - bz) * t;
      }
      if (!(Math.hypot(bx - ax, by - ay, bz - az) > 0.2)) return false;
    }
    // drawn in END.reveal pieces END.step apart from where the swing began (a) to where it ended (b): the slash
    // runs the sword's way; after the beat (beatNow) and a turn's later cuts' delay
    const now = this.game?.time ?? 0, t0 = now + (beatNow === 'beat' ? END.beat : 0) + (this._dly || 0), R = Math.max(1, END.reveal | 0);
    // a landed blow's line stays on what it hit; a whiff's moves on with him (his speed now, slowing at END.carry)
    const hit = placeNow !== 'blade' && this.hitRec === this.rec;
    const gv = this.p.groundVel, cvx = hit ? 0 : Number(gv?.x) || 0, cvz = hit ? 0 : Number(gv?.z) || 0;
    this._hit = hit;
    this._cvx = cvx;
    this._cvz = cvz;
    for (let i = 0; i < R; i++) {
      const f0 = i / R, f1 = (i + 1) / R, at = t0 + i * END.step;
      if (!(at > now)) {
        this._draw(ax, ay, az, bx, by, bz, thrust, kick && i === 0, f0, f1);
        continue;
      }
      // (a later piece of a carried line is laid where the line has got to by then)
      const dtc = at - now, cm = END.carry > 0 ? (1 - Math.exp(-END.carry * dtc)) / END.carry : dtc;
      const ox = cvx * cm, oz = cvz * cm;
      if (this.np >= NP) return;
      const o = this.np++ * 17, Q = this.pend;
      Q[o] = ax + ox;
      Q[o + 1] = ay;
      Q[o + 2] = az + oz;
      Q[o + 3] = bx + ox;
      Q[o + 4] = by;
      Q[o + 5] = bz + oz;
      Q[o + 6] = at;
      Q[o + 7] = thrust ? 1 : 0;
      Q[o + 8] = kick && i === 0 ? 1 : 0;
      Q[o + 9] = this.look;
      Q[o + 10] = f0;
      Q[o + 11] = f1;
      Q[o + 12] = this.kind;
      Q[o + 13] = hit ? 1 : 0;
      Q[o + 14] = cvx * Math.exp(-END.carry * dtc);
      Q[o + 15] = cvz * Math.exp(-END.carry * dtc);
    }
    return true;
  }

  /** The ending slashes whose beat is up (dropped if he has died since). */
  _flush() {
    const Q = this.pend, now = this.game?.time ?? 0, alive = this.p.hp > 0;
    for (let i = 0; i < this.np; ) {
      const o = i * 17;
      if (alive && now < Q[o + 6]) {
        i++;
        continue;
      }
      if (alive) {
        const look = this.look, kind = this.kind, hit = this._hit, cx = this._cvx, cz = this._cvz;
        this.look = Q[o + 9];
        this.kind = Q[o + 12];
        this._hit = Q[o + 13] > 0;
        this._cvx = Q[o + 14];
        this._cvz = Q[o + 15];
        this._draw(Q[o], Q[o + 1], Q[o + 2], Q[o + 3], Q[o + 4], Q[o + 5], Q[o + 7] > 0, Q[o + 8] > 0, Q[o + 10], Q[o + 11]);
        this.look = look;
        this.kind = kind;
        this._hit = hit;
        this._cvx = cx;
        this._cvz = cz;
      }
      const l = --this.np * 17;
      for (let k = 0; k < 17; k++) Q[o + k] = Q[l + k];
    }
  }

  /** Draw the line a → b, or its piece [f0, f1) of it (the strokes of the whole line that fall there). */
  _draw(ax, ay, az, bx, by, bz, thrust, kick, f0 = 0, f1 = 1) {
    const look = this.look, Lk = SLASH[LOOKS[look]];
    if (f0 <= 0) {
      this.onLine?.(ax, ay, az, bx, by, bz, LOOKS[look], this.kind);
      const la = this.last;
      la[0] = ax;
      la[1] = ay;
      la[2] = az;
      la[3] = bx;
      la[4] = by;
      la[5] = bz;
      la[6] = look;
      la[7] = this.kind;
      this.lines++;
    }
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-4)) return;
    dx /= len;
    dy /= len;
    dz /= len;
    // the weight of the line: on a landed blow the picture thrown along the cut and a shake (IMPACT), on a heavy
    // whiff its own smaller kick; the contact's burst of sparks; the slash's sound (player:slash)
    const K = Lk.kick, g = this.game, hv = look === 1 ? 1 : 0;
    if (kick && this._hit) {
      g?.kick?.(dx, dy, dz, IMPACT.kick[hv]);
      g?.shake?.(IMPACT.shake[hv]);
      this.kicks++;
      this._burst(ax, ay, az, bx, by, bz, dx, dy, dz, hv);
    } else if (K && kick) {
      g?.kick?.(dx, dy, dz, K.m);
      g?.shake?.(K.shake);
      this.kicks++;
    }
    if (f0 <= 0) {
      const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
      g?.events?.emit?.('player:slash', { heavy: hv === 1, hit: !!this._hit, thrust: !!thrust, x: cx, y: cy, z: cz });
    }
    const fx = this.p.fx?.add;
    if (!fx?.spawn) return;
    if (slashNow === 'dline') {
      // (the owner, 2026-11-27: "I still want to see the slash with this new thin line of small digits": the ending
      // line, its piece [f0, f1), as one seam of the slice's digits on its lattice, sharp at both ends)
      const steps = Math.max(2, Math.ceil(len / (SLICE.cell * (this.p.drawScale || 1) * 0.5)));
      for (let k = 0; k < steps; k++) {
        const f = (k + 0.5) / steps;
        if (f < f0 || f >= f1) continue;
        const w = thrust ? Math.pow(Math.max(0, 1 - f), 0.6) : Math.pow(Math.sin(Math.PI * f), 0.7);
        this._sliceCell(ax + dx * len * f, ay + dy * len * f, az + dz * len * f, 0.3 + 0.7 * w, 0, true);
      }
      return;
    }
    const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
    // the stroke's turn on the screen (as fx.js alongRot), and the screen's across (for the rows)
    const C = this.game?.camera?.matrixWorld?.elements;
    let rot = Math.atan2(dy, dx) - Math.PI / 2;
    let px = 0, py = 1, pz = 0;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-10) rot = Math.atan2(sy, sx) - Math.PI / 2;
      const qx = dy * C[10] - dz * C[9], qy = dz * C[8] - dx * C[10], qz = dx * C[9] - dy * C[8], ql = Math.hypot(qx, qy, qz);
      if (ql > 1e-6) {
        px = qx / ql;
        py = qy / ql;
        pz = qz / ql;
      }
    }
    // (a thrust's streak: fewer strokes, thinner, sharp toward its far end; the tone's size, colours and life)
    const TN = SLASH_TONE[toneNow], TC = TCOL[LOOKS[look]];
    const n = thrust ? Math.max(10, Math.round(Lk.n * 0.4)) : Lk.n;
    const o = this._o, seg = len / n, k0 = (thrust ? 0.75 : 1) * TN.size;
    o.vx = this._cvx || 0;
    o.vy = 0;
    o.vz = this._cvz || 0;
    o.drag = o.vx || o.vz ? END.carry : 0;
    const rows = thrust ? 1 : Math.max(1, Lk.rows | 0);
    o.rot = rot;
    o.colorEnd = TC.end;
    for (let r = 0; r < rows; r++) {
      // (the middle row is the line; the rows beside it thinner, shorter, no flash, no hairline)
      const mid = (rows - 1) / 2, off = rows > 1 ? (r - mid) * Lk.gap : 0, side = off !== 0, k = side ? k0 * Lk.outer : k0;
      const wMin = side ? 0.3 + (0.25 * Math.abs(r - mid)) / mid : 0;
      for (let pass = 0; pass < 3; pass++) {
        if (side && pass > 0) break;
        if ((pass === 2 && !TN.flash) || (pass === 1 && !(TN.hair > 0))) continue;
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n, s = (f - 0.5) * len;
          if (f < f0 || f >= f1) continue;
          const y = cy + dy * s + py * off;
          if (y < SLASH.floor) continue;
          // sharp at both ends (a thrust: full at the point, sharp at its far end)
          const w = thrust ? Math.pow(Math.max(0, 1 - f), 0.6) : Math.pow(Math.sin(Math.PI * f), 0.7);
          if (side && w < wMin) continue;
          o.x = cx + dx * s + px * off;
          o.y = y;
          o.z = cz + dz * s + pz * off;
          if (pass === 0) {
            const size = Lk.size * k * (0.25 + 0.75 * w);
            o.size = size;
            o.sizeEnd = size * Lk.hold;
            o.stretch = Math.min(30, (seg / size) * 1.8);
            o.life = (Lk.life[0] + (Lk.life[1] - Lk.life[0]) * w) * (side ? 0.9 : 1) * TN.life;
            o.alphaEnd = Lk.fade;
            o.color = side ? TC.edge : w > 0.92 ? TC.hot : TC.core;
            o.alpha = (0.55 + 0.45 * w) * (side ? 0.7 : 1) * TN.alpha;
          } else if (pass === 2) {
            // the flash: for a few frames the middle of the line is a blade of light
            if (w < 0.55) continue;
            o.size = Lk.flash.size * k * w;
            o.sizeEnd = Lk.size * k;
            o.stretch = Math.min(30, (seg / o.size) * 1.8);
            o.life = Lk.flash.life;
            o.color = Lk.hot;
            o.alpha = 1;
            o.alphaEnd = 0;
          } else {
            // the hairline: thinner, fainter, the last of it to go (the lines of a chain hang together)
            o.size = Lk.hair.size * k;
            o.sizeEnd = Lk.hair.size * k * 0.5;
            o.stretch = Math.min(40, (seg / o.size) * 1.6);
            o.life = Lk.hair.life * (0.6 + 0.4 * w) * TN.hair;
            o.color = TC.core;
            o.alpha = Lk.hair.alpha * w * TN.hairA;
            o.alphaEnd = 0;
          }
          fx.spawn(o);
        }
      }
    }
  }
}
