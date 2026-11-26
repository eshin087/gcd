import { registerItem } from '../../player/gear/index.js';
import { HAL_ITEMS } from '../halcyon/gear.js';

// Bai Wuji's gear (the BODY AGENT's file). TODAY A STAND-IN: Halcyon's body without the cape (his
// builders, re-registered under Bai Wuji's own ids), tinted dark by look.js, so the fight runs and
// draws. The body agent replaces this file whole (the dark high-collared coat, the white hair standing
// up over the blindfold, the hair that falls in phase 2, the eyes).
//
// THE BODY CONTRACT (what the rules, the fx and the moves read; the body agent keeps these exports and
// these names, whatever the body becomes):
//   gear.js   WJ_LOADOUT   the loadout (player/gear slots → item ids; weapon null: bare-handed)
//             WJ_FIST      his "blade": { guard, tip } along the sword joint's +Z (the right fist)
//   look.js   tintUntouched(M)          his colours, once after the rig is built (the kit's _tint)
//             dressUntouched(d, dt)     every frame (the kit's dress): reads d.dressPhase and d.eyesK
//             eyePoint(d, out)          his eyes as drawn (world; out a Vector3; finite even with no rig)
//             handPoint(d, side, out)   his right ('R') / left ('L') hand as drawn (world)
//             wjLettersOn()             his letters follow his size as the hero's (the kit's `letters`)
//             WJ_LOOKS, wjLook(name)    his look switches (`?wj...=`: duelist/lookSwitch.js lookOf)
//   poses.js  WJ_POSES ({ loco, duel }), GUARD, compileClip, completeBeat, CLIPS / REACT / OPEN (merged
//             with the three moves' pose files: poses.js header)
//   the actor (untouched.js) carries:
//             d.dressPhase   1 | 2 | 3: the dress shown (core sets it at a transition's impact: 2 = the
//                            blindfold off and the hair down; 3 = the void)
//             d.eyesK        0..1 how far his eyes burn (0 behind the blindfold; the moves and the
//                            transition set it; look.js / fx.js draw it)
//             d.eyePoint(out), d.handPoint(side, out)   the same points through the actor

const hal = (id) => HAL_ITEMS.find((i) => i.id === id)?.build;

/** The stand-in's items (Halcyon's builders: no cape). */
export const WJ_ITEMS = [
  { id: 'wj.head', slot: 'head', name: 'Blindfold', hidesHair: true, build: hal('hal.head') },
  { id: 'wj.coat', slot: 'chest', name: 'High-Collared Coat', build: hal('hal.suit') },
  { id: 'wj.arms', slot: 'arms', name: 'Coat Sleeves', build: hal('hal.arms') },
  { id: 'wj.legs', slot: 'legs', name: 'Dark Trousers', build: hal('hal.legs') },
  { id: 'wj.belt', slot: 'waist', name: 'Coat Belt', build: hal('hal.belt') },
];
for (const item of WJ_ITEMS) registerItem(item);

/** What he wears (no `weapon`: bare-handed; the right fist hangs on the sword joint). */
export const WJ_LOADOUT = Object.freeze({
  head: 'wj.head', chest: 'wj.coat', shoulders: null, arms: 'wj.arms', legs: 'wj.legs', waist: 'wj.belt', back: null, weapon: null,
});

/** His "blade": the right fist along the sword joint's +Z (Tian Lei's measure). */
export const WJ_FIST = Object.freeze({ guard: -0.06, tip: 0.075 });
