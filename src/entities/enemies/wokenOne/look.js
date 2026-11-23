import { lookOf } from '../duelist/lookSwitch.js';

// Xin Yi's look options (duelist/lookSwitch.js; never in PICKED: the owner picks from the sheets, PENDING):
//   ?oneLook=a|b|c   a the Long Coat (the fight is built with it): black, closed and still in phase 1,
//                    open from phase 2 (the tails fly); b the Cassock: buttoned to the neck, narrow,
//                    floor-length, a line of bright cells down the chest; c the Grey Coat: the same cut
//                    in dark blue-grey with a white-jade rim (for the phone).
// THE BODY AGENT'S FILE (tintOne: his colours, once; dressOne: by phase, every frame: phase 1 the left
// hand behind his back, phase 2 the coat open and the guns shown, phase 3 no guns, the rim brighter).
// LEAD'S STUB until the body lands.
export const ONE_LOOKS = Object.freeze({ oneLook: 'a' });
export const oneLook = (name = 'oneLook') => lookOf(name, ONE_LOOKS[name] ?? 'a');

/** His colours on the rig's own material instances, once after it is built. */
export function tintOne() {}

/** The body's dressing each frame (duelist kit.dress): by phase (d.phase) and by what he holds. */
export function dressOne() {}
