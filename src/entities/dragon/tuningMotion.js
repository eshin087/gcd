// The wyrm's motion pass (ADR-223): its held tells and its quick blow, as data. Read by tellPose.js and
// attacks.js; behind `?wyrmMotion=a|b` and `?wyrmQuick=a` (lookSwitch.js: '0', the wyrm as it shipped, is
// the default until the owner picks).

/** HELD TELLS: a blue or red hit of a string holds its cock (its kind's windup pose at k = 1) `hold` s
 *  longer before the strike (its windup, and so its impact, that much later: the cue and the strike are
 *  as before), and in mode 'a' its body says the colour while it holds. The audit (integ.mjs `wyrmaudit`)
 *  measured the striking part and the body moving through the whole windup of every blue lunge bite,
 *  wing buffet, wing slam and overhead and every red tail blow (held 0.00 - 0.13 s), and the blue and
 *  white windups of a kind alike. Numbers are model units (x SCALE) and pose fields (rig/anim.js
 *  createPose); `w` eases the colour in over the windup's u (0..1 of its own windup, before the hold). */
export const WYRM_HELD = Object.freeze({
  hold: 0.18, // s more of the cock
  longer: 0.95, // s: a hit wound up this long already reads (the slams): left alone; so is a hit with its own bait `hold`
  w: Object.freeze([0.25, 0.85]),
  // BLUE: it rears up, head high and drawn back over the withers, the jaw open, the chest swelled, the
  // sails lifted: "here it comes, meet it". `rear` lifts the forepaws (rig: a rise past the forelegs'
  // reach sits it back on its haunches instead), for a blow of the head only (a paw or a wing strikes)
  blue: Object.freeze({ lower: 0, pitch: -0.08, rear: 0.32, headUp: 0.6, headBack: 0.45, jaw: 0.25, swell: 0.45, spread: 0.2, tailLift: 0, tailCurl: 0, elbowsOut: 0 }),
  // RED: it sinks onto braced forelegs, head down and low, the sails folded tight, the tail coiled and
  // up: "get out of its way"
  red: Object.freeze({ lower: 0.42, pitch: 0.14, rear: 0, headUp: -0.5, headBack: 0.15, jaw: 0.1, swell: 0, spread: -0.18, tailLift: 0.35, tailCurl: 0.1, elbowsOut: 0.7 }),
});

/** THE QUICK BLOW (`?wyrmQuick=a`): a paw snapped out of its stance, no rear-back (the stance is the
 *  tell; the white glint cue at its very start: windup >= flashLead). Close only, a low weight, never a
 *  string's link. */
export const WYRM_QUICK = Object.freeze({
  weight: [1.1, 1.2, 1.3], // (×0 with the switch off)
});

/** THE STRIKE PASS (ADR-257, strike.js; `?wyrmStrike=a`, '0' as it shipped): the order a blow runs
 *  through the body. Measured by integ.mjs `wyrmanatomy`. Model units / pose fields / seconds. */
export const WYRM_STRIKE = Object.freeze({
  // BITES: over the last `lead` s of the windup the chest drops to `lower` and pitches to `pitch` (the
  // active's own 0.3 / 0.14, a little past: it settles back over `settle` s of the snap) while the head
  // hangs in the air; the snap runs the head to its goal on u^2 (`ease` its start's share of linear)
  // arriving on the impact, `headRate` the rig's follow (high: the path is the motion)
  // the body also surges `surge` units toward the hero over the lead (only when it stands `surgeFrom` units off)
  bite: Object.freeze({ lead: 0.1, lower: 0.42, pitch: 0.22, settle: 0.12, ease: 0.35, headRate: 70, surge: 0.4, surgeFrom: 4 }),
});
