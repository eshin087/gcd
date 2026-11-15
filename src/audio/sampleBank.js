// Recorded sounds and music (CC0, OpenGameArt; ADR-117). Content is data: which files exist, which
// game cue plays which bank at what level, and each level's score. The files are built from the
// source packs by scripts/audio/build-samples.py; assets/audio/CREDITS.md lists every source.
//
// A cue resolver gets the play() opts and the engine and returns the bank to play (or null: the
// synthesized recipe in sfx.js / fire.js plays as before). `layer: true` plays the recipe as well,
// under the sample (the timing cues keep their tuned, readable shape; the sample adds the body).
// Until a bank has loaded (or when samples are off: `?sound=synth`) every cue falls back to the synth.

export const SAMPLE_ROOT = 'assets/audio/';

const n = (prefix, count) => Array.from({ length: count }, (_, i) => `sfx/${prefix}-${i + 1}.mp3`);
const one = (name) => [`sfx/${name}.mp3`];

/** bank -> variant files (a play picks one, never the same twice in a row) */
export const BANKS = {
  // the hero
  swingL: n('swing-l', 4), swingH: n('swing-h', 3), thrust: n('thrust', 2),
  cutL: n('cut-l', 4), cutH: n('cut-h', 3),
  hitScale: n('hit-s', 3), hitCloth: n('hit-c', 3),
  hurt: n('hurt', 3), sizzle: n('sizzle', 1), roll: n('roll', 2), dodge: n('dodge', 2),
  stepGrass: n('step-g', 6), stepStone: n('step-s', 6),
  heal: n('heal', 1), noFlask: n('noflask', 1), lockOn: n('lock', 1),
  // combat cues and steel
  tellBlue: n('tell-blue', 1), tellRed: n('tell-red', 1), tellTick: n('tell-tick', 1), flash: n('flash', 1),
  parry: n('parry', 4), parryPerfect: n('parry-p', 3), block: n('block', 3), guard: n('guard', 2),
  deflect: n('deflect', 2), trade: n('trade', 2), guardBreak: n('gbreak', 1),
  ghostep: n('ghost', 1), plungeDive: n('plunge-dive', 1), plungeHit: n('plunge-hit', 1), burst: n('burst', 1),
  gong: n('gong', 2),
  // the wyrm
  roar: n('roar', 3), wake: n('wake', 1), phase2: n('phase2', 1), pain: n('pain', 3), recoil: n('recoil', 2),
  death: n('death', 1), stagger: n('stagger', 1), postureBreak: n('pbreak', 1),
  dragonStep: n('dstep', 2), land: n('land', 1), flap: n('flap', 3), takeoff: n('takeoff', 1), bite: n('bite', 1),
  swipe: n('swipe', 2), fireball: n('fireball', 1), boom: n('boom', 2), boomBig: n('boom-big', 1), hiss: n('hiss', 1),
  // the world breaks (ADR-107)
  chipStone: n('chip-stone', 3), chipWood: n('chip-wood', 2), chipMetal: n('chip-metal', 2), chipBone: n('chip-bone', 1),
  crashStone: n('crash-stone', 2), crashWood: n('crash-wood', 2),
  // spells (fire.js)
  bolt: n('bolt', 1), pillar: n('pillar', 1), ignite: n('ignite', 2), scream: n('scream', 1), cast: n('cast', 1),
  rumble: n('rumble', 1), novaCharge: n('nova-charge', 1),
  // world / ui
  bonfire: n('bonfire', 1), victory: n('victory', 1), area: n('area', 1), retry: n('retry', 1),
  uiSelect: one('ui-select'), uiStart: one('ui-start'), uiPause: one('ui-pause'), uiResume: one('ui-resume'), uiError: one('ui-error'),
};

// one reused result object: resolvers run on every play() and must not allocate
const R = { bank: '', gain: 1, rate: 1, layer: false, extra: '', extraGain: 0, extraDelay: 0 };
function S(bank, gain = 1, rate = 1, layer = false) {
  R.bank = bank;
  R.gain = gain;
  R.rate = rate;
  R.layer = layer;
  R.extra = '';
  return R;
}
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const SEMI = 1.0595;
const HEAVY_CUT = new Set(['slam', 'cleave', 'execute']);
const CHIP = { wood: 'chipWood', metal: 'chipMetal', bone: 'chipBone' };
const BLIP = { select: 'uiSelect', start: 'uiStart', pause: 'uiPause', resume: 'uiResume', error: 'uiError' };
const stone = (E) => {
  const id = E?.game?.level?.id;
  return !!id && id !== 'cinderwood';
};

/** cue name (sfx.js / fire.js) -> (opts, engine) => bank spec | null */
export const CUES = {
  // Gains are level-matched to the synth recipe each cue replaces (the owner's mix): both rendered
  // offline, the loudest 50 ms window compared; a layered sample sits about 6 dB under its recipe; no
  // gain above 2.5 (the limiter would pump).
  // ===== player =====
  swing: (o) => (o.thrust ? S('thrust', 0.25) : o.heavy ? S('swingH', 0.3) : S('swingL', 0.22, 1 + ((o.combo | 0) % 3) * 0.04)),
  slam: () => S('plungeHit', 0.76, 1, true),
  hit: (o) => (o.body === 'cloth' ? S('hitCloth', 0.55, o.heavy ? 0.9 : 1, !!o.crit) : S('hitScale', 0.57, o.heavy ? 0.85 : 1, !!o.crit)),
  // a semitone up each hit of the chain, the finisher drops (as the synth's CUT_STEP)
  cut: (o) => {
    const k = ((((o.combo | 0) - 1) % 5) + 5) % 5;
    const r = k === 4 ? 0.84 : SEMI ** k;
    return HEAVY_CUT.has(o.weight) ? S('cutH', 0.3, r) : S('cutL', 0.16, r * (o.alt ? 1.02 : 0.98));
  },
  hurt: () => S('hurt', 0.26),
  sizzle: () => S('sizzle', 0.2),
  roll: () => S('roll', 1.2),
  footstep: (o, E) => S(stone(E) ? 'stepStone' : 'stepGrass', o.sprint ? 0.075 : 0.056),
  heal: () => S('heal', 0.52),
  noFlask: () => S('noFlask', 0.37),
  lockOn: (o) => S('lockOn', 0.15, o.on === false ? 0.85 : 1),
  dodge: () => S('dodge', 0.18),
  // ===== combat cues (layered under the synth) =====
  tellBlue: () => S('tellBlue', 0.24, 1, true),
  tellRed: () => S('tellRed', 0.77, 1, true),
  tellTick: () => S('tellTick', 0.03, 1, true),
  flash: () => S('flash', 0.14, 1, true),
  hazardTell: () => null,
  parry: (o) => (o.perfect || o.perfectMelee ? S('parryPerfect', 1, 1, true) : S('parry', 1.1, 1 + clampTo(o.chain, 0, 8) * 0.015, true)),
  returnHit: () => S('burst', 0.59),
  block: (o) => S('block', 0.92, o.tell === 'blue' ? 0.92 : 1),
  guard: (o) => S('guard', 1.07, o.heavy ? 0.9 : 1),
  deflected: () => S('deflect', 2.5),
  trade: (o) => S('trade', 2.5, o.heavy ? 0.9 : 1),
  guardBreak: () => S('guardBreak', 2.5),
  ghostep: () => S('ghostep', 0.66, 1, true),
  flurryCut: (o) => S('cutL', 0.45, 1 + clampTo(o.n, 0, 8) * 0.04),
  flurryCoil: () => null,
  flurryBurst: () => null,
  plungeDive: () => S('plungeDive', 0.18),
  plungeHit: (o) => S('plungeHit', o.exec ? 2.45 : 2.08),
  dragonRecoil: () => S('recoil', 0.93),
  postureBreak: (o) => {
    S('postureBreak', 2.3);
    if (o.roar) {
      R.extra = 'roar';
      R.extraGain = 0.7;
      R.extraDelay = 0.22;
    }
    return R;
  },
  gong: () => S('gong', 0.96),
  // ===== the wyrm =====
  roar: (o) => S('roar', 0.47 + 0.23 * clampTo(num(o.strength, 1), 0.3, 1.5), clampTo(num(o.pitch, 1), 0.6, 1.6)),
  wake: () => S('wake', 0.71),
  dragonStep: (o) => S('dragonStep', o.heavy ? 1.22 : 0.82),
  wingFlap: (o) => S('flap', 0.67 + 0.5 * clampTo(o.strength, 0, 1.5)),
  takeoff: () => S('takeoff', 1.17),
  land: () => S('land', 2.29),
  bite: () => S('bite', 1.09),
  windup: () => null,
  dragonSwipe: () => S('swipe', 0.19),
  dragonPain: () => S('pain', 0.43),
  fireball: () => S('fireball', 0.48),
  explosion: (o) => (num(o.radius, 4) > 6 ? S('boomBig', 1.7) : S('boom', 0.78 + 0.36 * clampTo(num(o.radius, 4) / 4, 0.3, 1.5))),
  chip: (o) => S(CHIP[o.mat] || 'chipStone', 0.68 + 0.6 * clampTo(o.power, 0, 1.5)),
  crash: (o) => S(o.mat === 'wood' ? 'crashWood' : 'crashStone', 2.5),
  stagger: () => S('stagger', 1.23),
  phase2: (o) => (o.roar === false ? null : S('phase2', 1.27)),
  dragonDeath: () => S('death', 2.29),
  emberHiss: () => S('hiss', 0.26),
  // ===== spells (fire.js) =====
  meteorFall: () => null,
  boltLaunch: () => S('bolt', 0.59),
  meteorHit: () => S('boom', 1.51),
  pillar: () => S('pillar', 1.31),
  diveScream: () => S('scream', 0.26),
  skyRoar: () => S('roar', 0.21, 0.9),
  meteorCast: () => S('cast', 0.55),
  rumble: () => S('rumble', 0.64),
  flameIgnite: () => S('ignite', 1.36),
  novaCharge: () => S('novaCharge', 1.44),
  novaBlast: () => S('boomBig', 1.7),
  // ===== world / ui =====
  bonfire: () => S('bonfire', 0.22),
  victory: () => S('victory', 0.38),
  area: () => S('area', 0.21),
  retry: () => S('retry', 0.26),
  blip: (o) => S(BLIP[o.kind] || 'uiSelect', 0.1),
};

function num(v, d) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

// ===== music: each level's score (+ the shared victory / death) =================================
// file, gain (linear, on the music bus), loop, loopFrom (s: where a loop restarts, after an intro),
// xfade (s: the overlap when a track loops into itself; a track mastered as a seamless loop uses a few ms)
// The tracks are loudness-normalised (boss -16 LUFS, ambient -20); MUSIC_LEVEL brings them up to the
// synth score's level on the music bus (measured: both modes played ~6 dB under it at 1).
const MUSIC_LEVEL = 2;
const T = (file, gain = 1, loop = true, loopFrom = 0, xfade = 2.5) => ({ file: `music/${file}.mp3`, gain: gain * MUSIC_LEVEL, loop, loopFrom, xfade });

export const MUSIC = {
  cinderwood: {
    ambient: T('cinder-ambient', 0.9),
    boss: T('cinder-boss', 1, true, 0, 0.04), // Juhani Junkala's loop is seamless
    boss2: T('cinder-boss2', 1, true, 0, 0.04),
  },
  ash: {
    ambient: T('ash-ambient', 0.9),
    boss: T('ash-boss', 1, true, 14.8), // the koto intro plays once
    boss2: T('ash-boss2', 1),
  },
  starless: {
    ambient: T('starless-ambient', 1, true, 0, 0.5),
    boss: T('starless-boss', 1),
    boss2: T('starless-boss2', 1),
  },
  victory: T('victory', 1, false),
  death: T('death', 0.9, false),
};

/** the level's ambience bed (a loop on the ambient bus, under the synthesized wind / crickets / fire) */
export const BEDS = {
  cinderwood: { file: 'amb/bed-cinder.mp3', gain: 0.5, loop: true, loopFrom: 0, xfade: 1.5 },
  ash: { file: 'amb/bed-ash.mp3', gain: 0.55, loop: true, loopFrom: 0, xfade: 1.5 },
  starless: { file: 'amb/bed-starless.mp3', gain: 0.6, loop: true, loopFrom: 0, xfade: 2 },
};

/** Every file the game may fetch (tests check they all exist). */
export function allSampleFiles() {
  const out = new Set();
  for (const list of Object.values(BANKS)) for (const f of list) out.add(f);
  const walk = (m) => {
    for (const v of Object.values(m)) {
      if (v && typeof v.file === 'string') out.add(v.file);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(MUSIC);
  walk(BEDS);
  return [...out];
}
