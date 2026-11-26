// A duelist's moves, realised: shared by every boss built on duelist.js (the Ash Disciple, the
// Starless Lord). The data format is the Ash Disciple's (ashDisciple/moves.js header): a MOVE is
// { label, phase, weight [per phase], cooldown, band, recovery, recoveryKeys, beats }, a BEAT one hit,
// feint or cast with its tell, windup, optional bait hold, active frames, zone, root motion and pose
// keys. Two additions for longer, more varied strings:
//   { pick: [beat, beat, ...] }   in place of a beat: one alternative is drawn as the move starts
//   fixed: true                   on a beat: its windup is not scaled by the phase (a cast, a transition)
//   sustain: { dur, tick }        on a beat: it stays lit `dur` s past its active frames (its end and
//                                 everything after it wait; `S` on the realised beat: brain.js)

/** Value for the phase (1-based) from a per-phase array, or the value itself. */
export function perPhase(v, phase) {
  return Array.isArray(v) ? v[Math.min(v.length, Math.max(1, phase)) - 1] : v;
}

/**
 * The realiser for one boss: realise(name, phase, rnd) → a move as it will play this time: phase
 * scaling, drawn alternatives, rolled chances, the bait holds, absolute times per beat ({ start,
 * impact, end, flash, tellAt }) and the compiled clip. `rnd` = a 0..1 source (the game's Math.random,
 * so the seeded sims replay). `compileClip(keys, dur, phase)` → the clip (poses.js).
 * `opts.count` (a `streak` move: his flurry, DEFENSE.foeStreak): that many beats, the move's first
 * and then its others in turn.
 *
 * The POSE keys of a beat past its impact (u 1..2) do not run on the active frames' clock: a blade
 * cannot follow through in the 0.08 s a hit is live for (the hand crossed half a metre in one frame).
 * They run over the beat's FOLLOW (`F` s, b.follow or FOLLOW_MAX at most): FOLLOW_PART of the time
 * the string leaves before the next beat's first pose, never shorter than the active frames. Gameplay (the
 * zone, root motion, `uAt`) keeps the active frames' clock. A key marked `gather` (the first draw
 * toward the cock, authored from the guard) is left out of a beat that follows another: there the
 * follow-through of the last cut IS the draw. A key marked `settle` (the blade easing back after a
 * follow-through) is left out of a beat that another follows: he goes from the follow-through
 * straight into the next cock. A bait hold (`H`) repeats the cocked pose at its end, so the strike
 * out of it is as fast as any other (one long ease from the cock had the blade creep forward through
 * the pause). `completeBeat(keys)` (poses.js) makes each beat's keys whole.
 */
const FOLLOW_MAX = 0.24; // s: the longest follow-through of a blow
const FOLLOW_RING = 0.3; // … of a spin (a ring zone): its whole turn runs on this clock, 0.18 s was a blur
const FOLLOW_PART = 0.72; // of the time to the next beat's first pose: the rest is his way into it
// `keysOf(beat)` (optional): the pose keys a beat plays THIS time, read as each move is realised (a boss
// whose blows have a second animation behind a live switch, e.g. Tian Lei's `?fists=ref`: the keys
// measured from the owner's reference footage, scripts/mocap/duelist); null or undefined = `beat.keys`.
export function makeRealise({ TUNING, MOVES, compileClip, completeBeat = null, keysOf = null }) {
  return function realise(name, phase = 1, rnd = Math.random, opts = null) {
    const def = MOVES[name];
    if (!def) return null;
    const cnt = Math.round(Number(opts?.count));
    const list = def.streak && cnt >= 1 && def.beats.length > 1
      ? Array.from({ length: cnt }, (_, i) => (i === 0 ? def.beats[0] : def.beats[1 + ((i - 1) % (def.beats.length - 1))]))
      : def.beats;
    const ws = perPhase(TUNING.windupScale, phase), rs = perPhase(TUNING.recoveryScale, phase);
    const lead = perPhase(TUNING.flashLead, phase);
    const beats = [];
    const keys = [];
    let t = 0;
    list.forEach((raw, i) => {
      const b = Array.isArray(raw.pick) ? raw.pick[Math.min(raw.pick.length - 1, Math.floor(rnd() * raw.pick.length))] : raw;
      if (b.chance !== undefined && b.chance < 1 && !(rnd() < b.chance)) return;
      const W = b.windup * (b.fixed ? 1 : ws);
      const H = Array.isArray(b.hold) ? b.hold[0] + (b.hold[1] - b.hold[0]) * rnd() : 0;
      const A = b.active;
      const S = Math.max(0, Number(b.sustain?.dur) || 0);
      const cock = b.cock ?? 0.8;
      const start = t, impact = t + W + H, end = impact + A + S;
      const at = (u) => (u <= 1 ? (u <= cock ? start + u * W : start + cock * W + H + (u - cock) * W) : impact + (u - 1) * (A + S));
      const C = TUNING.close;
      const close = b.close ?? (b.dash || b.leap || b.release || !b.zone ? 0 : beats.length === 0 ? C.first : C.next);
      beats.push({
        def: b, index: i, hit: beats.length, start, impact, end, W, H, A, S, at, close,
        tellAt: start, flash: impact - lead, feint: !!b.feint,
        announced: false, flashed: false, done: false, landed: false,
      });
      t = end;
    });
    // the realised hits (not feints) get their hit index; `last` = the move's last real hit
    let n = 0;
    for (const b of beats) if (!b.feint) b.hit = n++;
    const hits = n;
    for (const b of beats) b.last = !b.feint && b.hit === hits - 1;
    const recovery = def.recovery * rs;
    const end = t + recovery;
    // the pose keys, beat by beat (see the header: the follow-through's own clock)
    const own = (b, chained, followed = false) => ((keysOf ? keysOf(b.def) : null) ?? b.def.keys ?? []).filter(([, pose]) => !(chained && pose.gather) && !(followed && pose.settle));
    beats.forEach((b, i) => {
      const nb = beats[i + 1];
      const mine = own(b, i > 0, !!nb);
      // when the next pose after this beat is due: the next beat's first key, else the recovery's
      let next = end;
      if (nb) {
        const nk = own(nb, true);
        next = nk.length ? nb.at(Math.min(...nk.map(([u]) => u))) : nb.impact;
      } else if (def.recoveryKeys?.length) next = t + Math.min(...def.recoveryKeys.map(([r]) => r)) * recovery;
      else next = t + recovery * 0.75;
      // a sustained beat (a beam held lit): its keys past the impact span the whole lit time
      b.F = b.S > 0 ? b.A + b.S
        : Math.max(b.A, Math.min(b.def.follow ?? (b.def.zone?.kind === 'ring' ? FOLLOW_RING : FOLLOW_MAX), (next - b.impact) * FOLLOW_PART));
      const list = mine.map(([u, { gather, settle, ...pose }]) => ({ t: u <= 1 ? b.at(u) : b.impact + (u - 1) * b.F, ...pose }));
      if (b.H > 1e-3) {
        // the bait hold: the cocked pose (the last key at or before the cock) again as the hold ends
        const cock = b.def.cock ?? 0.8;
        const held = mine.filter(([u]) => u <= cock + 1e-6).sort((x, y) => y[0] - x[0])[0];
        if (held) {
          const { gather, settle, e, ...pose } = held[1];
          list.push({ t: b.at(held[0]) + b.H, ...pose });
        }
      }
      list.sort((x, y) => x.t - y.t);
      keys.push(...(completeBeat ? completeBeat(list) : list));
    });
    for (const [r, pose] of def.recoveryKeys ?? []) keys.push({ t: t + r * recovery, ...pose });
    const clip = compileClip(keys, end, phase);
    clip.name = name;
    clip.steps = true; // (anim.js _feetClip: the feet hold their ground and step under the root motion)
    return { name, def, beats, hits, recoveryStart: t, end, clip, phase };
  };
}
