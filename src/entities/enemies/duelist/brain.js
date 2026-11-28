import { clamp, wrapAngle, smoothstep, turnToward } from '../../../core/math.js';
import { TELL, TELL_STYLE, RESULT, DEFENSE, dodgeOnly, isFlare } from '../../../combat/rules.js';
import { perPhase } from './realise.js';
import { GUARD_TRAVEL, GUARD_KINDS } from './guard.js';
import { DUEL_WORLD, DUEL_MARK } from './worldTuning.js';
import { CueLedger, throwsAt, glaiveHome } from './ledger.js';
import { ATTACK_SOUND, beatSound } from './attackSound.js';
import { answerOf, DODGE, prepareChoose, directWeight, booked, linkFor, linkUsable } from './director.js';
import { newPin, pinAt, pinStep } from '../../../combat/contact.js';
import { strikeGapFloor } from './strikeGap.js';

// ---------------------------------------------------------------------------------------------------
// THE SECOND PASS: the director, the links, the cue ledger and the fairness guard. The API other
// modules code against (all on `d.brain`):
//
//   brain.expect(timeFromNow, tell, source) → handle | null
//       Something of his (a thing that flies, falls or lingers) will land on the hero `timeFromNow`
//       s from now, needing the answer `tell` asks (normal / blue: a guard; red / black: a dodge).
//       `source`: its attack name. The handle: `retime(timeFromNow)`, `cancel()`, `alive`, `left`;
//       it expires by itself 0.3 s after its impact. Call it as the thing is made (and retime it if
//       its arrival changes), so the director and the fairness guard see it before its cue. What
//       flies in the existing pools (fx.crescents, fx.shots, fx.strikes, the Starless Sky, both
//       terrain objects' pieces / rings / marks) and the world's felled pieces are seen without it.
//         const h = d.brain.expect(flight, TELL.NORMAL, 'emberFan');   // a projectile
//         ... h.retime(newFlight); on a parry / a fizzle: h.cancel();
//         const m = d.brain.expect(burnAt - now, TELL.RED, 'burningLine'); // a lingering mark
//   brain.fairDelay(timeFromNow, tell, max = pressure.guard.maxDelay) → s
//       For a strike that is CALLED (its time is his to choose): how long to wait so it lands clear
//       (>= pressure.guard.sep + margin s) of every known impact needing the other answer, the
//       running move's beats included: 0 = now is clear, -1 = no wait up to `max` clears it (call it
//       later or not at all). Count a delay you made with brain.stats.delays++.
//   brain.worldClash(landsIn, tell) → bool
//       A felled piece of the world asks at its flash (world/destructibles.js): true = a blow of his
//       already cued needs the other answer within pressure.guard.sep of its landing; it then lands
//       uncued and harmless (counted in stats.fizzles).
//   brain.stats  { picks, links, chains, cuts, rests, holds, holdTime, feints, toldFeints, delays, fizzles, floors, seeks }
//       picks: AI picks · links: moves started from a LINKS entry · chains: moves started by the old
//       flow roll (`chain`) · cuts: of those, started before the recovery's end (`cut`) · rests:
//       breathers after pressure.chainDepth moves in a row · holds / holdTime: blade blows held at
//       the cock by the fairness guard (s in all) · feints: blows it could not clear by a hold, not
//       thrown (a feint: no glint, no hit) · toldFeints: of those, ones whose combat:tell had gone out (a
//       blow at risk is announced only once the guard clears it at its cue: _tellRisk) · delays: called strikes / torn stones moved later (or faded) ·
//       fizzles: things in flight that gave way to a falling piece of the world · floors:
//       picks a floor forced · seeks: footwork sent to another range for an absent category.
//   brain.ledger  the CueLedger (ledger.js): conflict / clearShift / pending queries.
//
// LINKS (kit.LINKS or the actor's `LINKS`, from <boss>/links.js):
//   { from: [ { to, when, chance, force, band, cut }, ... ] }   the first whose `when` holds (any /
//   near / mid / far / front / side / behind / away / guarding: director.js whenHolds), whose
//   `chance` roll passes (a number or one per phase) and whose target is usable (phase, weight,
//   cooldown unless `force: true`, its band unless `band: false`) starts with no footwork between,
//   at `cut` of the recovery (default pressure.linkCut: the first part stays the punish window).
//   Only a move that ended on its own links (a recoil, a stagger, a flurry or a counter took it).
//   pressure.chainDepth moves in a row at most, then pressure.chainRest of footwork.
//
// A kit without TUNING.pressure picks, links and paces exactly as before (the ledger only listens).
//
// FOUR OPTIONAL BEAT FIELDS (Tian Lei's, 2026-11-21; a beat without them behaves exactly as before):
//   zone.fwd / zone.side   the zone's centre is `fwd` m ahead of him and `side` m to his LEFT (his
//                          body +x), not his root: a blow whose reach is round a limb (a side kick's
//                          heel, a dash elbow). _inZone, zoneDebug, _worldBlow, _ideal, _reach read it.
//   air: true              the beat is tested whatever his height (a flying kick, a dive); a move holds
//                          him up between beats with each beat's `lift` (its last value stays).
//   sustain: { dur, tick } the beat stays LIT `dur` s after its impact (realise.js: its end, and the
//                          string after it, wait for it; u runs 1..2 over active + dur): the zone gives
//                          its one result in the active frames as any beat, then the actor's
//                          d.onSustain(beat, sense, act, k) is called every `tick` s (k 0..1 through
//                          the lit window). The cue ledger counts the whole lit window as one interval
//                          (ledger.js conflict): nothing asking the other answer is cued inside it.
//   selfHit: true          (with a zone, usually with `sustain`) the ACTOR tests the zone and deals the
//                          hits itself (Tian Lei's beams: a first contact, then ticks while lit; ki
//                          BeamMoves): the brain cues, flashes, holds and ledgers the beat as any blow
//                          and calls d.onImpact, but gives no zone result and no world blow of its own.
//   T.airFall { g }        (TUNING) a reaction / break / death that starts in the air drops him to the
//                          floor at `g` m/s² instead of snapping the root to y = 0.
//   stance: { from, open } (Tian Lei's third wave, 2026-11-22) on a FEINT beat with a bait `hold`: THE
//                          COUNTER STANCE. From `from` (0.3) of the windup to the impact he is catching
//                          (brain.catching() → the beat): a sword cut that reaches him is CAUGHT
//                          (duelist.takeHit: no damage, the hero's blade thrown back as by a deflect,
//                          `dragon:guard { deflect, caught }`) and the move jumps to the beat's end
//                          (onCaught), so the beats after it, the punish, start at once. Nothing caught
//                          by the impact: the move ENDS there (its later beats never play) and he stands
//                          open `open` s (0.6) with his guard down. brain.stats.caught / stanceMiss.
// startLock(o) takes overrides of TUNING.lock (`dist`: the lock at range, player.startBladeLock).
//
// THE PURSUIT (Tian Lei's, 2026-11-23; the owner: "make the boss also stop attacking empty air if the
// player moves out of the distance"; a kit without `pressure.pursue` behaves exactly as before).
// TUNING.pressure.pursue: { margin, after, gap, closeK, dashK, away, leapLead, blinkLead, blinkKeep, miss,
// lead, habit, habitMax, habitDecay }
//   - the reach watch: through each real melee beat's windup, from `after` s past its start up to its
//     glint (never after it: a glint is always a blow), the hero is led to the impact (his own movement,
//     _lead) and set against what the beat can still reach (_reachLeft: the zone, the step-in left, the
//     dash not yet spent); beyond it by `margin` m he BREAKS OFF (no glint, no hit: an unthrown blow, as
//     a feint) and chases: a `far` / `away` link of the move, else footwork after a `gap` s breather
//     (his dash and his closing blink run in it). brain.stats.stops counts them. Not a counter, a
//     flurry, a counter stance, a draw, a transformation, nor a blow out of a leap / a thrown thing, nor
//     one out of a blink before he has blinked (their reach is wherever the hero is); a hero led past
//     the circle he keeps to (d.bound) by more than the blow's own reach is out of reach of any of them.
//   - the chase: while the hero is backing away (his speed away over `away` m/s) a beat's step-in
//     budget is x `closeK` and a dash's length cap x `dashK` (each one number or one per phase; the
//     dash's timing as authored).
//   - a leap lands where the hero is GOING: its landing spot leads him by up to `leapLead` s (until its
//     `lock`, as before); the actor's blink may lead him by `blinkLead` s, never past `blinkKeep` m short
//     of its own distance (Tian Lei's ascendant.js beatMotion: still behind / beside the hero).
//   - the pick reads the hero's feet (director.js reaches): a move whose first blow could not reach
//     where he will be at its impact (his speed away x min(its first impact, `lead`) s) weighs x `miss`,
//     and is never a link.
//   - his read of a hero who runs: every break-off adds 1 to brain.runner (at most `habitMax`, falling
//     `habitDecay` a second); while it is up, a move whose first blow reaches wherever the hero goes (a
//     blink, a leap, a thrown or called thing, a beam, a dash of 4 m or more) weighs x (1 + `habit` x
//     runner).
//   brain.forecast(s) is the director's view (the hero's speed away, m/s).
//
// THE SHEATHED'S FIELDS (ADR-144; a beat or a move without them behaves exactly as before):
//   draw: true             a draw (always blue with the flare, `fixed`): its combat:tell waits for its cue
//                          (it is announced with the click); as its cue comes due the actor's
//                          d.mayCue(beat, act) is asked: false (the hero cannot answer: knocked down,
//                          guard-open) holds it at the cock, up to T.draw.wait s, then it becomes a feint
//                          (no tell, no flare, no hit) and d.onHonorFeint(act, beat) is called. No world
//                          blow at its impact (the actor's cut fells what it fells, on the click).
//   stopOn: ['blocked', 'hit']   the move ends when this beat is answered so (d.onStopOn(act, beat, r),
//                          then the later beats are spent and the timeline goes to the recovery)
//   def.recoverOpen        (on a move) the fraction of its recovery that is open, instead of
//                          T.guard.recoverOpen (1: no guard all the way: the blade is out)
//   def.cooldown           may be per phase
// ---------------------------------------------------------------------------------------------------

const FLOOR = !!TELL_STYLE.red.floor; // a red area rings the floor through its windup (rules.js: no)

// A duelist's mind and timeline: the Ash Disciple's (docs/specs/ash-disciple.md §3), shared by every
// human boss built on duelist.js. Everything it knows about one boss comes from the actor's kit
// (d.kit: { TUNING, MOVES, MOVE_NAMES, CLIP, realise, transitions }); what only one boss does is a
// hook on the actor (d.brainFrame, d.afterPose, d.onImpact, d.onRelease, d.onCast, d.beatMotion,
// d.onTransitionEnd, and for moves that depend on the level: d.weigh, d.onActStart). Modes (d.mode):
//   sleep    kneeling in meditation (state 'sleeping'); flow calls startIntro, or a strike wakes him
//   intro    rises, flicks the jian, salutes; then 'dragon:introDone' (state 'waking')
//   foot     footwork between moves: circling / closing / backing off, guard up after a raise delay
//   act      a move (realise.js): per beat the tell at its windup start, the glint flashLead
//            before its impact, root motion (travel / dash / leap), the zone tested through the
//            active frames (one hit per beat); a `release` / `cast` beat hands its impact to the actor
//   react    a reaction clip: a ward (his guard meets a strike), deflect (he beats it away and
//            counters), flinch, backstep, sidestep, stagger, recoil, executed
//   broken   posture broken: on one knee for breakTime (state 'staggered')
//   dying    the death clip, then the ash; finishDeath() → 'dead'
// A phase's transition is the move kit.transitions[phase] (the disciple's 'kindle'), started as soon
// as he is free once that phase's gate is hit.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const ease = (u) => u * u * (3 - 2 * u);
/** The windup fraction u (0..1, 1..2 in the active frames) of beat b at move time t (holds included;
 *  a fairness hold, `hf` / `hl`: u stands still through it, as in an authored hold). */
function uAt(b, t) {
  const W = b.W, H = b.H, cock = b.def.cock ?? 0.8;
  let impact = b.impact;
  if (b.hl > 0) {
    t -= clamp(t - b.hf, 0, b.hl);
    impact -= b.hl;
  }
  const s = t - b.start;
  if (t >= impact) return 1 + clamp((t - impact) / Math.max(1e-4, b.A + (b.S || 0)), 0, 1);
  if (s <= cock * W) return clamp(s / Math.max(1e-4, W), 0, 1);
  if (s <= cock * W + H) return cock;
  return clamp(cock + (s - cock * W - H) / Math.max(1e-4, W), 0, 1);
}
/** Piecewise-linear [[u, v], ...] at u. */
function track(keys, u) {
  if (!keys?.length) return 0;
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, v0] = keys[i - 1], [u1, v1] = keys[i];
      return v0 + (v1 - v0) * ease((u - u0) / Math.max(1e-4, u1 - u0));
    }
  }
  return keys[keys.length - 1][1];
}

// a parried blow's rebound (setBack): the pose shown runs back along the strike at `speed` × time for
// `time` s (his blade thrown off the guard), then the move's own clip takes over through `blend` s
const REBOUND = { time: 0.07, speed: 0.55, blend: 0.1 };

const REACT_BASE = {
  ...Object.fromEntries(Object.entries(GUARD_TRAVEL).map(([k, v]) => [k, { travel: v }])),
  flinch: { travel: -0.12 },
  sidestep: { side: 1.8 },
  stagger: { travel: -0.7 },
  recoil: { travel: -0.55 },
  executed: { travel: -1.4 },
  reeling: { travel: -1.0 },
  trampled: { travel: -0.5 },
  lock: { travel: 0 },
};
/** Reactions that leave him open (state 'staggered': the camera, the HUD, the bots read it). */
const OPEN = new Set(['stagger', 'recoil', 'executed', 'reeling', 'trampled']);

export class DuelBrain {
  constructor(d) {
    this.d = d;
    const K = d.kit;
    this.K = K;
    this.T = K.TUNING;
    this.M = K.MOVES;
    this.names = K.MOVE_NAMES;
    this.C = K.CLIP;
    /** reaction clips' root motion (kit.REACT adds / overrides) */
    this.R = { ...REACT_BASE, backstep: { travel: -this.T.move.backstep.dist }, ...(K.REACT ?? {}) };
    /** reactions that leave him open */
    this.open = new Set([...OPEN, ...(K.OPEN ?? [])]);
    this.aiEnabled = true;
    this._ld = { dx: 0, dz: 0, dist: 0, ang: 0 };
    /** the dragon:attack payload (reused: listeners read it at once) */
    this._atk = { name: '', weapon: 'sword', weight: 'light', shape: 'cut', tell: TELL.NORMAL, impactIn: 0, x: 0, z: 0 };
    /** the impacts he knows are coming (ledger.js) */
    this.ledger = new CueLedger(this);
    this.reset();
  }

  /** The boss's pressure block (TUNING.pressure), or null: the director, the links' depth and the
   *  fairness guard are off without it. */
  get P() {
    return this.T.pressure ?? null;
  }

  reset() {
    this.clock = 0;
    this.chainN = 0; // moves in a row with no footwork between (links and the flow)
    this.runner = 0; // (pressure.pursue) how much the hero has run from his blows lately: + 1 a break-off
    this.catRun = 0;
    this.lastCat = null;
    this.catSeen = {};
    this.floorT0 = 0;
    this.forceCat = null;
    this.seek = null;
    this.seekNext = 0;
    this._phaseSeen = 0;
    this.stats = { picks: 0, links: 0, chains: 0, cuts: 0, rests: 0, holds: 0, holdTime: 0, feints: 0, toldFeints: 0, delays: 0, fizzles: 0, floors: 0, seeks: 0, caught: 0, stanceMiss: 0, stops: 0 };
    this.guardLog = Array.from({ length: 64 }, () => ({ t: -1, kind: '', what: '', with: '' }));
    this._gi = 0;
    this.ledger?.reset();
    this.cooldowns = {};
    this.last = [null, null];
    this.gapT = 1.2;
    this.strafeDir = 1;
    this.strafeT = 2;
    this.raiseT = 0;
    this.counter = { n: 0, t: -9, pending: false, link: 0 };
    this.struck = { n: 0, t: -9 };
    this.backCool = 0;
    this.sideCool = 0;
    this.pendingPhase = 0;
    this.pendingBreak = false;
    this.wakeFallback = -1;
    this.act = null;
    this.react = null;
    this.modeT = 0;
    this.clip = this.C.meditate;
    this.clipT = 0;
    // the pose shown runs `off` s behind the clip (a parried blow held at the contact, setBack)
    this.back = { off: 0, t: 0 };
    // the pose shown held where his blow met what it struck, then carried on (combat/contact.js: pinAt)
    this.pin = newPin();
    // the guard raised over his footwork (0..1: poses.js blends the wardHold clip in) and how long
    // it stays up after a strike was met
    this.wardK = 0;
    this.wardT = 0;
    this.leap = null;
    this.zone = null;
    this.falling = false; // (T.airFall) dropping to the floor out of the air
    this.fallV = 0;
    const d = this.d;
    d.mode = 'sleep';
    d.state = 'sleeping';
    d.anim?.play?.('duel', 0.01);
  }

  // ---------------------------------------------------------------- queries
  /** His guard covers his front: in footwork (after the raise delay), through a ward or a deflect,
   *  through the first part of each windup (until TUNING.guard.windupOpen of it: the blade is still
   *  between you; past it he has committed to the strike and it can be traded), and in the late part
   *  of a move's recovery (past TUNING.guard.recoverOpen of it: the punish window comes first, then
   *  he breaks the recovery off into his guard). */
  guardUp() {
    const d = this.d, G = this.T.guard;
    if (d.broken) return false;
    if (d.mode === 'foot') return this.raiseT <= 0;
    if (d.mode === 'act') {
      const a = this.act;
      if (!a || a.def.transition) return false;
      if (a.t >= a.recoveryStart) return a.t - a.recoveryStart >= (a.def.recoverOpen ?? G.recoverOpen ?? 1) * Math.max(0.05, a.end - a.recoveryStart);
      const b = a.beats.find((x) => a.t < x.end + 1e-6);
      return !!b && a.t < b.impact && uAt(b, a.t) < G.windupOpen;
    }
    return d.mode === 'react' && (GUARD_KINDS.has(this.react?.kind) || this.react?.kind === 'backstep');
  }

  /** The hero is swinging at him from his front, in reach (the guard comes up to meet it). */
  threatened() {
    const d = this.d, pl = d.game.player, p = pl?.position;
    if (!p || pl.alive === false || (pl.state !== 'attack' && pl.state !== 'heavy')) return false;
    const dx = d.position.x - p.x, dz = d.position.z - p.z, dist = Math.hypot(dx, dz);
    if (!(dist < 4.4) || !d._fromFront()) return false;
    return Math.abs(wrapAngle(Math.atan2(dx, dz) - fin(pl.yaw))) < 1.1; // the hero faces him
  }

  _sense() {
    const d = this.d, pl = d.game.player, p = pl?.position;
    if (!p || !Number.isFinite(p.x + p.z)) return null;
    const dx = p.x - d.position.x, dz = p.z - d.position.z;
    // the hero's own movement (his intent, not his displacement: steady through a hit-stop), capped
    let vx = Number.isFinite(pl.vel?.x) ? pl.vel.x : 0, vz = Number.isFinite(pl.vel?.z) ? pl.vel.z : 0;
    const v = Math.hypot(vx, vz);
    if (v > 9) {
      vx *= 9 / v;
      vz *= 9 / v;
    }
    return { dx, dz, dist: Math.hypot(dx, dz), ang: Math.atan2(dx, dz), p, vx, vz };
  }

  /** Where the hero will be `secs` from now if he keeps moving (relative to him): leads every
   *  step-in, windup track and dash, so a running hero is met, not chased. */
  _lead(s, secs, out = this._ld) {
    const k = clamp(secs, 0, 0.5);
    out.dx = s.dx + s.vx * k;
    out.dz = s.dz + s.vz * k;
    out.dist = Math.hypot(out.dx, out.dz);
    out.ang = Math.atan2(out.dx, out.dz);
    return out;
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const d = this.d;
    this.clock += dt;
    this.modeT += dt;
    this.clipT += dt;
    this.ledger.update();
    if (this.P?.guard) {
      this._fairStrikes(dt);
      this._glaiveTurn();
    }
    if (this.raiseT > 0) this.raiseT -= dt;
    if (this.runner > 0) this.runner = Math.max(0, this.runner - dt * (this.P?.pursue?.habitDecay ?? 0.1));
    if (this.backCool > 0) this.backCool -= dt;
    if (this.sideCool > 0) this.sideCool -= dt;
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    // the guard raised over his footwork: up in ~0.07 s as the hero swings at him, held a moment
    // after a strike was met, down in ~0.25 s
    if (this.wardT > 0) this.wardT -= dt;
    const up = d.mode === 'foot' && this.raiseT <= 0 && !d.broken && (this.wardT > 0 || this.threatened());
    this.wardK = clamp(this.wardK + clamp((up ? 1 : 0) - this.wardK, -dt * 4.5, dt * 15), 0, 1);
    // a parried blow's rebound: the pose runs back along the strike, then the clip takes over again
    const B = this.back;
    if (B.t > 0) {
      B.t -= dt;
      B.off += dt * (1 + REBOUND.speed);
      if (B.t <= 0) {
        B.off = 0;
        if (d.mode === 'act') d.anim.play('duel', REBOUND.blend);
      }
    }
    if (this.pin.pin) pinStep(this.pin, this.clipT, dt);
    // (the cue's spike on his body dies out in ~0.25 s; nothing glows through a windup: ADR-118)
    d.warn = Math.max(0, d.warn - dt * 6.4);
    this.zone = null;
    switch (d.mode) {
      case 'sleep':
        this._sleep(dt);
        break;
      case 'intro':
        if (this.modeT >= this.clip.dur) this._toCombat();
        break;
      case 'foot':
        this._foot(dt);
        break;
      case 'act':
        this._act(dt);
        break;
      case 'react':
        this._react(dt);
        break;
      case 'broken':
        this._broken(dt);
        break;
      case 'dying':
        this._dying(dt);
        break;
      default:
        break;
    }
    if (this.falling) this._fall(dt);
    d.brainFrame?.(dt);
  }

  /** Off the floor as a reaction, a break or the death starts: with T.airFall he drops (`falling`),
   *  without it the root is put on the floor at once (as before). */
  _ground() {
    const d = this.d, F = this.T.airFall;
    if (F?.g > 0 && d.position.y > 0.05) {
      if (!this.falling) this.fallV = 0;
      this.falling = true;
      return;
    }
    this.falling = false;
    d.position.y = 0;
  }

  /** The drop (T.airFall): gravity until the floor; a beat that flies (`lift`, `leap`) takes over. */
  _fall(dt) {
    const d = this.d, a = this.act;
    if (d.mode === 'act' && a && (this.leap || a.beats.some((b) => a.t < b.end && a.t >= b.start && b.def.lift))) {
      this.falling = false;
      return;
    }
    this.fallV += (this.T.airFall?.g ?? 30) * dt;
    d.position.y = Math.max(0, d.position.y - this.fallV * dt);
    if (d.position.y <= 0) this.falling = false;
  }

  /** A random value in [lo, hi] of a per-phase [[lo, hi], ...] (a breather's length). */
  _gap(v) {
    const G = perPhase(v, this.d.phase);
    return G[0] + (G[1] - G[0]) * Math.random();
  }

  // ---------------------------------------------------------------- the ledger's public face
  /** Something of his will land `timeFromNow` s from now, needing what `tell` asks (see the header). */
  expect(timeFromNow, tell, source = '') {
    return this.ledger.expect(timeFromNow, tell, source);
  }

  /** How long a CALLED strike landing `timeFromNow` s from now must wait to land clear of every
   *  known impact needing the other answer (0: clear now; -1: no wait up to `max` clears it). */
  fairDelay(timeFromNow, tell, max = this.P?.guard?.maxDelay ?? 0.6, source = '') {
    const G = this.P?.guard;
    if (!G || !Number.isFinite(timeFromNow)) return 0;
    const L = this.ledger;
    const sh = L.clearShift(L.now + timeFromNow, answerOf(tell), (G.sep ?? 0.3) + (G.margin ?? 0), max);
    if (sh < 0 && max > 0) this._note('uncalled', source || this.act?.name || '?');
    return sh;
  }

  /** The guard's diary: what it would not let through, and the impact it collided with (a ring of
   *  64 entries, written only when the guard steps in; the PACE meter tallies the pairs). */
  _note(kind, what) {
    const g = this.guardLog, e = g[this._gi % g.length];
    this._gi++;
    e.t = this.d.time;
    e.kind = kind;
    e.what = what;
    e.with = this.ledger.hit;
  }

  /**
   * The fairness guard on called strikes (his marks, the Dark Star: fx.strikes): one about to give
   * its cue this frame whose impact would land within sep + margin of a known impact needing a guard
   * waits (its `at` moves later) until it is clear, `maxDelay` s at most in all; if no wait clears
   * it, the mark fades out unstruck. A torn stone about to leave the Void's grip (fx.shots, 'hang')
   * waits in it the same way.
   */
  _fairStrikes(dt) {
    const S = this.d.fx?.strikes;
    if (!S) return;
    const G = this.P.guard, L = this.ledger, lead = perPhase(this.T.flashLead, this.d.phase);
    const sep = (G.sep ?? 0.3) + (G.margin ?? 0);
    let moved = false;
    for (const s of S) {
      if (!s.alive || s.flashed || s.t + dt < s.at - lead - 1e-4) continue;
      // (the pool's records are reused: `at` not the one written here = a new strike)
      if (s._fairAt !== s.at) s._fairDelayed = 0;
      const left = Math.max(0, G.maxDelay - s._fairDelayed);
      const sh = L.clearShift(L.now + (s.at - s.t), DODGE, sep, left, false, false, s);
      if (sh > 0) {
        s.at += sh;
        s._fairAt = s.at;
        s._fairDelayed += sh;
        this.stats.delays++;
        moved = true;
      } else if (sh < 0) {
        // no wait up to maxDelay clears it: the mark fades out unstruck (never two answers at once)
        s.alive = false;
        this._note('fade', s.attack ?? 'strike');
        this.stats.delays++;
        moved = true;
      }
    }
    // the Lord's torn stones hanging in the Void's grip: one about to be thrown waits in the grip
    // until where it will reach the hero is clear (its flight: from where it hangs, at its speed)
    const H = this.d.fx?.shots, p = this.d.game.player?.position;
    if (H && p) {
      for (const s of H) {
        if (!s.alive || s.phase !== 'hang' || s.age + dt < s.delay - 1e-4) continue;
        if (s._fairD !== s.delay) s._fairDelayed = 0;
        const left = Math.max(0, G.maxDelay - s._fairDelayed);
        const fly = Math.max(0, Math.hypot(p.x - s.x, p.z - s.z) - (s.radius ?? 0.8) - 0.45) / Math.max(1, s.speed);
        const sh = L.clearShift(L.now + Math.max(0, s.delay - s.age) + fly, answerOf(s.tell), sep + (G.pad ?? 0), left);
        if (sh > 0) {
          s.delay += sh;
          s._fairD = s.delay;
          s._fairDelayed += sh;
          this.stats.delays++;
          moved = true;
        }
      }
    }
    // (what it predicted for them is stale now: the blades decide on the fresh times this frame)
    if (moved) this.ledger.update();
  }

  /**
   * The thrown blade's way home against a world warning given while it still flew out (_worldCue
   * kept it on the blade: `_homeWarn`, the warning's time, `_homeSep` its room). The frame after it
   * turns (its hang there, 0.32 s and more, keeps its cue some frames off): the blade has asked
   * fairDelay at the turn (starlessLord/fx.js) and may hang longer; if its way home still lands
   * within that room of the warning, it comes home uncued and harmless this pass, as a thing in
   * flight gives way to the world's warning.
   */
  _glaiveTurn() {
    const S = this.d.fx?.shots, pp = this.d.game.player?.position;
    if (!S) return;
    const L = this.ledger, pr = this.d.game.player?.radius ?? 0.45;
    for (const s of S) {
      if (s._homeWarn === undefined || Number.isNaN(s._homeWarn)) continue;
      // (a record of the pool thrown again, or a warning long past: forget it)
      if (!s.alive || s.kind !== 'glaive' || s._homeWarn < L.now - 0.3) {
        s._homeWarn = NaN;
        continue;
      }
      if (s.phase !== 'back') continue;
      const at = s._homeWarn;
      s._homeWarn = NaN;
      if (s.done || s.flashed >= 0 || !pp) continue;
      const home = Math.max(0, s.wait ?? 0) + Math.max(0, Math.hypot(pp.x - s.x, pp.z - s.z) - (s.radius ?? 0.8) - pr) / Math.max(1, s.back || s.speed);
      if (Math.abs(L.now + home - at) >= s._homeSep) continue;
      s.done = true;
      this.stats.fizzles++;
    }
  }

  /**
   * A falling piece of the world asks at its flash (world/destructibles.js, `landsIn` s before it
   * lands): does a blow of his already cued need the other answer within `sep` of its landing? Then it
   * lands uncued and harmless (true), as a thrown piece the guard could not clear does. (A blow told
   * before the piece began to fall is held at its own cue if a hold clears it; when none does, both
   * cues went out within 0.3 s: lord.mjs pace, seed 4242 form 2, a void push and a felled shard.)
   */
  worldClash(landsIn, tell) {
    const G = this.P?.guard;
    if (!G || !Number.isFinite(landsIn)) return false;
    if (!this.ledger.conflict(this.ledger.now + landsIn, answerOf(tell), G.sep ?? 0.3, true)) return false;
    this.stats.fizzles++;
    return true;
  }

  /**
   * The world warns of a falling piece landing at `at` (ledger time) needing `ans` (a felled pillar,
   * a wrenched shard: no one can move it). What of his is in flight, not cued yet, and would land
   * within sep + margin + pad of it needing the other answer gives way: a crescent / push / fissure
   * fizzles, a torn stone shatters in the air (never two answers at once).
   */
  _worldCue(at, ans) {
    const G = this.P?.guard, d = this.d, p = d.game.player, pp = p?.position;
    if (!G || !pp) return;
    const L = this.ledger, sep = (G.sep ?? 0.3) + (G.margin ?? 0) + (G.pad ?? 0), pr = p.radius ?? 0.45;
    const C = d.T.crescent;
    if (d.fx?.crescents && C) {
      for (const c of d.fx.crescents) {
        if (!c.alive || c.done || c.flashed >= 0 || answerOf(c.tell) === ans) continue;
        const speed = c.speed ?? C.speed, rx = pp.x - c.x, rz = pp.z - c.z, along = rx * c.dx + rz * c.dz;
        const t = L.now + Math.max(0, along - (c.radius ?? C.radius) - pr) / Math.max(1, speed);
        if (Math.abs(t - at) >= sep) continue;
        d.fx._fizzle?.(c);
        c.alive = false;
        this.stats.fizzles++;
      }
    }
    if (d.fx?.shots) {
      for (const s of d.fx.shots) {
        if (!s.alive || answerOf(s.tell) === ans) continue;
        if (s.kind === 'glaive' && s.phase === 'fly') {
          // the thrown blade still going AWAY: two crossings, estimated as the ledger estimates them
          // (it used to be timed as if it came straight at the hero, so the turn was never seen).
          // Its outward pass (not cued yet, the hero ahead on its line): it goes on past him uncued
          // and harmless this pass. Its way home (to the turn, the hang there, back to his hand:
          // ledger.glaiveHome; whatever the outward pass did): the turn starts a fresh pass, so the
          // verdict is kept on the blade (`_homeWarn`) and given at the turn (_glaiveTurn)
          const reach = (s.radius ?? 0.8) + pr, rx = pp.x - s.x, rz = pp.z - s.z;
          const along = rx * s.dx + rz * s.dz, across = Math.abs(-rx * s.dz + rz * s.dx);
          if (!s.done && s.flashed < 0 && s.speed > 0 && across < reach + 0.5 && along > reach && Math.abs(L.now + (along - reach) / s.speed - at) < sep) {
            s.done = true;
            this.stats.fizzles++;
          }
          const home = glaiveHome(s, pp, reach, d._hilt ?? d.position);
          if (home >= 0 && Math.abs(L.now + home - at) < sep) {
            s._homeWarn = at;
            s._homeSep = sep;
          }
          continue;
        }
        if (s.done || s.flashed >= 0) continue;
        const speed = s.phase === 'back' ? s.back : s.speed;
        const fly = Math.max(0, Math.hypot(pp.x - s.x, pp.z - s.z) - (s.radius ?? 0.8) - pr) / Math.max(1, speed);
        const t = L.now + (s.phase === 'hang' ? Math.max(0, s.delay - s.age) : Math.max(0, s.wait ?? 0)) + fly;
        if (Math.abs(t - at) >= sep) continue;
        // (the thrown blade goes on past him this pass, uncued and harmless; it still comes home)
        if (s.kind !== 'stone') s.done = true;
        else if (d.fx._shatter) d.fx._shatter(s);
        else s.alive = false;
        this.stats.fizzles++;
      }
    }
    // the courtyard's thrown pieces (ashDisciple/terrain.js: the kicked lantern, the kicked
    // flagstones) still in the air and not cued: they land uncued and harmless (`quiet`), as a piece
    // the guard could not clear at its throw does
    const Tr = d.terrain;
    if (Tr) {
      const quiet = (R) => {
        const pc = R?.piece;
        if (!R?.live || R.flashed || R.quiet || !pc || answerOf(R.tell) === ans) return;
        if (Math.abs(L.now + Math.max(0, (pc.T ?? 0) - (pc.t ?? 0)) - at) >= sep) return;
        R.quiet = true;
        R.h?.cancel?.();
        this.stats.fizzles++;
      };
      quiet(Tr.shot);
      if (Tr.kicks) for (const R of Tr.kicks) quiet(R);
    }
  }

  /**
   * The fairness guard on a blade's blow (_act, the frame its cue is due): if it would land within
   * sep + margin of a known impact needing the other answer (a cue already given, a thing in flight,
   * an expected one), it waits at the cock, as an authored bait hold waits: the beat's cue, impact
   * and end and everything after them in the move move later together, the pose stands at the cock
   * (or, past it, where it is) and u stands still (uAt), `maxHold` s at most per blow. Only if the
   * wait clears it. True: held (no cue this frame).
   */
  _holdBeat(a, b, t) {
    const G = this.P?.guard;
    if (!G || a.def.transition || b.feint || (b.def.cast && !throwsAt(b))) return false;
    // (a `fixed` beat keeps its timing: it is never held, only, at worst, not thrown)
    const room = b.def.fixed ? 0 : Math.max(0, G.maxHold - (b.hl ?? 0));
    const L = this.ledger, ans = answerOf(b.def.tell), sep = (G.sep ?? 0.3) + (G.margin ?? 0);
    // (a release: what it throws lands when it reaches the hero, `pad` more room for his moving)
    const th = throwsAt(b), fly = th ? L.travel(b) : 0, pad = th ? G.pad ?? 0 : 0;
    const sh = L.clearShift(L.now + (b.impact - t) + fly, ans, sep + pad, room, true, true);
    if (sh === 0) return false;
    if (sh < 0) {
      // no wait he may take clears it (a felled piece, a thing in flight lands too near): the blow
      // is not thrown. It becomes a feint (the swing goes on, no glint, no hit: a feint never
      // glints), so the hero is never asked two answers at once. Not in his flurry (it counts blows)
      if (a.streak) return false;
      b.feint = true;
      this._note(b.announced ? 'toldFeint' : 'feint', a.name);
      this.stats.feints++;
      // (one already announced: the guard's verdict changed after its tell; the meter reports it)
      if (b.announced) this.stats.toldFeints++;
      return true;
    }
    this._delay(a, b, t, sh);
    this.stats.holds++;
    this.stats.holdTime += sh;
    return true;
  }

  /**
   * The honor gate (ADR-144; a `draw` beat only): as its cue comes due, the actor's mayCue(b, a) false
   * (the hero cannot answer it) holds it at the cock, a frame at a time, T.draw.wait s at most; past
   * that it becomes a feint (no tell, no flare, no hit) and the actor's onHonorFeint(a, b) is called.
   * True: no cue this frame.
   */
  _honor(a, b, t, dt) {
    const d = this.d;
    if (typeof d.mayCue !== 'function' || d.mayCue(b, a) !== false) return false;
    const wait = this.T.draw?.wait ?? 0.6;
    if ((b.honorT ?? 0) < wait) {
      const sh = Math.max(1e-4, t - b.flash + dt);
      b.honorT = (b.honorT ?? 0) + sh;
      this._delay(a, b, t, sh);
      return true;
    }
    b.feint = true;
    this._note('feint', a.name);
    this.stats.feints++;
    d.onHonorFeint?.(a, b);
    return true;
  }

  /** Move beat b (its cue, impact and end) and everything after it in move a later by `sh` s, the pose
   *  standing at the cock meanwhile (the fairness guard's hold, the honor gate's wait). */
  _delay(a, b, t, sh) {
    if (b.hl > 0) b.hl += sh;
    else {
      b.hf = Math.max(t, b.start + (b.def.cock ?? 0.8) * b.W + b.H);
      b.hl = sh;
    }
    a.hb = b;
    b.flash += sh;
    b.impact += sh;
    b.end += sh;
    let after = false;
    for (const x of a.beats) {
      if (x === b) {
        after = true;
        continue;
      }
      if (!after) continue;
      x.start += sh;
      x.tellAt += sh;
      x.flash += sh;
      x.impact += sh;
      x.end += sh;
    }
    a.recoveryStart += sh;
    a.end += sh;
    if (a.next) a.next.at += sh;
  }

  /** A beat's announcement (combat:tell: the HUD, the audio's sting, the timing trainer). */
  _announce(a, b, t) {
    const d = this.d;
    b.announced = true;
    const p = d.tellPoint(b.def.part, d._v2);
    d.emit('combat:tell', { source: 'dragon', attack: a.name, tell: b.def.tell, impactIn: Math.max(0.05, b.impact - t), x: p.x, z: p.z, flare: isFlare(b.def.tell, b.def.flare) });
  }

  /**
   * At a beat's announcement: would the fairness guard turn it into a feint if its cue were due now
   * (_holdBeat's own test, with the hold it may still take)? Then its tell waits for the guard's
   * verdict at the cue. Never for a black blow (its charge is drawn through the windup), his flurry
   * (never feinted), a transition or a cast that is not thrown.
   */
  _tellRisk(a, b, t) {
    const G = this.P?.guard;
    if (!G || a.def.transition || a.streak || b.feint || b.def.tell === TELL.BLACK || (b.def.cast && !throwsAt(b))) return false;
    const room = b.def.fixed ? 0 : Math.max(0, G.maxHold - (b.hl ?? 0));
    const L = this.ledger, sep = (G.sep ?? 0.3) + (G.margin ?? 0);
    const th = throwsAt(b), fly = th ? L.travel(b) : 0, pad = th ? G.pad ?? 0 : 0;
    return L.clearShift(L.now + (b.impact - t) + fly, answerOf(b.def.tell), sep + pad, room, true, true) < 0;
  }

  /** After the pose (the blade's points are fresh): the actor's swing trails and body FX. */
  afterPose(dt) {
    const d = this.d;
    if (d.mode === 'dead') return;
    d.afterPose?.(dt, this.act);
  }

  _sleep(dt) {
    const d = this.d;
    d.groundVelSet(0, 0);
    if (this.wakeFallback > 0) {
      this.wakeFallback -= dt;
      if (this.wakeFallback <= 0) this.startIntro();
    }
  }

  // ---------------------------------------------------------------- mode changes
  _play(clip, blend = 0.12) {
    this.clip = clip;
    this.clipT = 0;
    this.back.off = this.back.t = 0;
    this.pin.pin = false;
    this.d.anim.play('duel', blend, true);
  }

  /** Jump the move's timeline forward to move time `t` (a trade clash spends the beat that was
   *  about to land: duelist._tradeNow). The tells due in the gap fire on the next frame as usual. */
  skipTo(t) {
    const a = this.act;
    if (!a || !(t > a.t)) return;
    this.clipT += t - a.t;
    a.t = t;
  }

  /** The counter stance he is in now (a beat marked `stance`, inside its catching window), else null. */
  catching() {
    const a = this.act;
    if (this.d.mode !== 'act' || !a) return null;
    const t = a.t;
    for (const b of a.beats) {
      const C = b.def.stance;
      if (!C || b.caught || b.catchOver) continue;
      if (t >= b.impact) return null;
      const from = b.start + clamp(fin(C.from, 0.3), 0, 1) * (b.impact - b.start);
      return t >= from ? b : null;
    }
    return null;
  }

  /** A cut was caught in stance beat `b` (duelist.takeHit): the move jumps to the beat's end, so the
   *  punish after it starts now. */
  onCaught(b) {
    if (!b || b.caught) return;
    b.caught = true;
    this.stats.caught++;
    this.skipTo(b.end);
  }

  /** The stance caught nothing by its impact: the move ends here, and he is open `open` s. */
  _stanceMiss(a, b) {
    const open = Math.max(0, fin(b.def.stance?.open, 0.6));
    this.stats.stanceMiss++;
    this._toFoot(open);
    this.raiseT = Math.max(this.raiseT, open);
    this.wardK = 0;
  }

  /** The hero is parrying this blow (duelist.parryContact): the pose shown is held `off` s back on
   *  the strike, where the blade meets his guard; `rebound`: the blow is only deflected (the move
   *  goes on), so the blade is thrown back off the guard before the clip takes over again. */
  /** CONTACT (combat/contact.js, ADR-259): the pose shown is held at clip time `tc` (where his blow met
   *  what it struck), `hold` s more after the freeze, then catches up with the clip over `follow` s. */
  pinAt(tc, hold, follow) {
    if (!(tc >= 0)) return;
    pinAt(this.pin, tc, this.clipT, hold, follow);
  }

  setBack(off, rebound) {
    this.pin.pin = false;
    this.back.off = Math.max(0, fin(off));
    this.back.t = rebound ? REBOUND.time : 0;
  }

  startIntro() {
    const d = this.d;
    if (d.mode !== 'sleep') return;
    d.mode = 'intro';
    d.state = 'waking';
    this.modeT = 0;
    this._play(this.C.intro, 0.05);
    d.emit('dragon:wake');
    d.fx.dust(d.position.x, d.position.z, 0.8);
  }

  /** Skip the intro: straight into the duel (Lab, flow's debug 'boss'). */
  startFight() {
    const d = this.d;
    if (d.mode === 'dying' || d.mode === 'dead') return false;
    if (d.mode === 'sleep' || d.mode === 'intro') this._toCombat();
    return true;
  }

  _toCombat() {
    const d = this.d;
    const wasIntro = d.mode === 'intro' || d.mode === 'sleep';
    this._toFoot(0.6);
    this.raiseT = 0;
    if (wasIntro) d.emit('dragon:introDone');
  }

  _toFoot(gap = null) {
    const d = this.d;
    d.mode = 'foot';
    d.state = 'combat';
    this.act = null;
    this.react = null;
    this.leap = null;
    this._ground();
    this.modeT = 0;
    this.chainN = 0;
    this.raiseT = this.T.guard.raiseDelay;
    this.gapT = gap ?? this._gap(this.T.idleGap);
    this.clip = null;
    this.clipT = 0;
    this.back.off = this.back.t = 0;
    this.pin.pin = false;
    d.anim.play('loco', 0.18);
    if (this.pendingBreak) {
      this.pendingBreak = false;
      d._break();
    }
  }

  /** Start a move now. Returns false if it can't (unknown, he is down). `opts.count`: his flurry
   *  (a `streak` move) of that many blows: every one the hero parries or blocks is counted
   *  (duelist.onStreakBlow). */
  startAct(name, phase = this.d.phase, opts = null) {
    const d = this.d;
    if (d.mode === 'dying' || d.mode === 'dead' || d.mode === 'broken') return false;
    const A = this.K.realise(name, phase, Math.random, opts);
    if (!A) return false;
    // the actor's own set-up for the move (it picks the piece of the level the move will use); false:
    // it cannot be done now, and nothing has changed
    if (d.onActStart?.(A, opts) === false) return false;
    if (A.def.streak) {
      A.streak = { need: A.hits, got: 0, failed: false };
      d.emit('dragon:flurry', { count: A.hits });
    }
    A.t = 0;
    A.chain = 0;
    A.striking = null;
    A.root = { x: d.position.x, z: d.position.z };
    A.travelled = 0;
    this.act = A;
    this.react = null;
    this.leap = null;
    d.mode = 'act';
    d.state = 'combat';
    this.modeT = 0;
    this._play(A.clip, 0.1);
    const def = A.def;
    this.cooldowns[name] = perPhase(def.cooldown, d.phase) ?? 0;
    this.last[1] = this.last[0];
    this.last[0] = name;
    if (def.transition) {
      const n = def.phase ?? 2;
      d.enterPhase(n);
      d.emit(`dragon:phase${n}`);
      d.emit('dragon:roar', { strength: 0.6 });
    } else d.emit('dragon:windup', { name });
    return true;
  }

  /** A reaction clip (cancels a move). */
  startReact(kind) {
    const d = this.d;
    if (d.mode === 'dying' || d.mode === 'dead' || d.mode === 'sleep') return false;
    const clip = this.C[kind];
    if (!clip) return false;
    if (d.mode === 'act' && this.act?.def?.transition && kind !== 'executed') return false; // the kindling holds
    this.act = null;
    this.chainN = 0;
    this.leap = null;
    this._ground();
    d.mode = 'react';
    d.state = this.open.has(kind) ? 'staggered' : 'combat';
    d.warn = 0;
    const R = this.R[kind] ?? {};
    this.react = { kind, clip, t: 0, travel: R.travel ?? 0, side: R.side ? R.side * (Math.random() < 0.5 ? -1 : 1) : 0, moved: 0 };
    this.modeT = 0;
    // (a guard's contact pose is its first frame, which a hit-stop holds: no cross-fade into it)
    this._play(clip, GUARD_KINDS.has(kind) ? 0 : kind === 'flinch' ? 0.05 : 0.08);
    return true;
  }

  /** The blade lock (a perfect parry of a `lock` blow): blades crossed until the hero's push is
   *  decided (player.startBladeLock → disciple.onLockEnd). False if the hero can't lock. */
  startLock(o = null) {
    const d = this.d, p = d.game.player, L = o ? { ...this.T.lock, ...o } : this.T.lock;
    if (typeof p?.startBladeLock !== 'function') return false;
    if (!this.startReact('lock')) return false;
    // (`dist`: the lock at range, e.g. a beam's head on the hero's blade; absent: the hero's lockDist)
    const ok = p.startBladeLock(d, { start: L.start, push: L.push, decay: perPhase(L.decay, d.phase), dur: L.dur, hold: L.hold, dist: L.dist });
    if (!ok) {
      this.startReact('recoil');
      return false;
    }
    // he steps in his half of the way to the lock's distance (the hero closes the other: player.js)
    const s = this._sense();
    if (s && this.react) this.react.travel = clamp((s.dist - (L.dist ?? 1.3)) * 0.5, -0.5, 0.9);
    d.emit('dragon:windup', { name: 'bladeLock' });
    // the camera closes in on the crossed blades (no slow motion: the push is in real time); the
    // lock's end (won: the reeling moment) replaces it, a loss lets it ease out over the counter
    d._cinematic('lock', { ...L.camera, slowmo: 1, dur: L.dur });
    return true;
  }

  startBroken() {
    const d = this.d;
    this.act = null;
    this.react = null;
    this.leap = null;
    this._ground();
    d.mode = 'broken';
    d.state = 'staggered';
    this.modeT = 0;
    this.counter.pending = false;
    this.counter.link = 0;
    this._play(this.C.broken, 0.1);
  }

  startDeath() {
    const d = this.d;
    this.act = null;
    this.react = null;
    this.leap = null;
    this._ground();
    d.mode = 'dying';
    d.state = 'dying';
    this.modeT = 0;
    this._play(this.C.death, 0.12);
  }

  /** Lab: the next phase's transition now (HP down to the gate if it is above). `n` must be the
   *  phase after the current one. */
  forcePhase(n = this.d.phase + 1) {
    const d = this.d, mv = this.K.transitions?.[n];
    if (!mv || n !== d.phase + 1 || d.mode === 'dying' || d.mode === 'dead') return false;
    if (d.mode === 'sleep' || d.mode === 'intro') this._toCombat();
    d.hp = Math.min(d.hp, d.nextPhaseHp);
    this.pendingPhase = 0;
    return this.startAct(mv, d.phase);
  }
  forcePhase2() {
    return this.forcePhase(2);
  }

  /** Lab: force a move now (wakes him into the duel first). False while he can't. */
  trigger(name) {
    const d = this.d;
    if (!this.M[name]) return false;
    if (d.mode === 'dying' || d.mode === 'dead' || d.mode === 'broken') return false;
    if (d.mode === 'sleep' || d.mode === 'intro') this._toCombat();
    if (this.M[name].transition) return this.forcePhase(this.M[name].phase ?? 2);
    if (this.M[name].phase > d.phase) return false;
    return this.startAct(name);
  }

  // ---------------------------------------------------------------- footwork
  _foot(dt) {
    const d = this.d, s = this._sense();
    const M = this.T.move;
    if (!s) {
      d.groundVelSet(0, 0);
      return;
    }
    d.yaw = turnToward(d.yaw, s.ang, perPhase(M.turn, d.phase) * dt);
    if (this.pendingPhase > d.phase) {
      const mv = this.K.transitions?.[this.pendingPhase];
      this.pendingPhase = 0;
      if (mv && this.startAct(mv, d.phase)) return;
    } else this.pendingPhase = 0;
    if (!this.aiEnabled) {
      d.groundVelSet(0, 0);
      return;
    }
    if (this.counter.pending) {
      this.counter.pending = false;
      const link = this.counter.link | 0;
      this.counter.link = 0;
      // (a strike-back of the flash chain, combat/flashChain.js: the act carries its link, so a flash
      // counter of one of its blows is the next)
      if (this.startAct(this.K.counterMove?.(d.phase) ?? 'riposte') && link && this.act) this.act.flashLink = link;
      return;
    }
    // a heavy blow levelled at him: sometimes he steps out of it
    const pl = d.game.player;
    if (this._evade(s)) return;
    // a hero drinking a flask is punished: no breather, the moves that close distance favoured
    const punish = pl?.state === 'heal';
    this.gapT -= dt;
    if (punish) this.gapT = Math.min(this.gapT, 0);
    if (this.gapT <= 0) {
      const name = this._choose(s.dist, punish);
      if (name) {
        if (this.startAct(name) && this.P) booked(this, name);
        return;
      }
    }
    // movement: inside striking range he circles (guard up) while the breather runs; outside it he
    // closes: a run, and past sprintAt a sprint (faster than the hero's): kiting him doesn't work.
    // (the director's seek: for a while he keeps to another range, where an absent kind of move can
    // be used: director.js prepareChoose)
    if (this.seek && (this.clock > this.seek.until || punish)) this.seek = null;
    const SK = this.seek;
    const band = SK ? SK.band : M.band, sprintAt = SK ? Math.max(M.sprintAt, SK.band[1] + 2) : M.sprintAt;
    let speed = 0, dirX = 0, dirZ = 0;
    const fx = s.dx / (s.dist || 1), fz = s.dz / (s.dist || 1);
    if (s.dist > sprintAt || (punish && s.dist > band[1])) {
      speed = M.sprint;
      dirX = fx;
      dirZ = fz;
    } else if (s.dist > band[1]) {
      speed = M.run;
      dirX = fx;
      dirZ = fz;
    } else if (SK && s.dist < band[0]) {
      // seeking a longer range: he gives ground, still facing the hero
      speed = M.run;
      dirX = -fx;
      dirZ = -fz;
    } else if (s.dist < M.near && this.backCool <= 0) {
      this.backCool = 2.4;
      if (Math.random() < M.backChance) {
        this.startReact('backstep');
        return;
      }
    } else {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeDir = Math.random() < 0.7 ? -this.strafeDir : this.strafeDir;
        this.strafeT = M.strafeSwitch[0] + (M.strafeSwitch[1] - M.strafeSwitch[0]) * Math.random();
      }
      // circling, drifting in or out toward the middle of the band
      const mid = (band[0] + band[1]) / 2, inward = clamp((s.dist - mid) / 0.8, -1, 1) * 0.6;
      speed = M.walk;
      dirX = -fz * this.strafeDir + fx * inward;
      dirZ = fx * this.strafeDir + fz * inward;
      const l = Math.hypot(dirX, dirZ) || 1;
      dirX /= l;
      dirZ /= l;
    }
    const x0 = d.position.x, z0 = d.position.z;
    d.moveBy(dirX * speed * dt, dirZ * speed * dt);
    // pressed against a wall while circling: circle the other way
    if (speed > 0 && speed <= M.walk && Math.hypot(d.position.x - x0, d.position.z - z0) < speed * dt * 0.3) this.strafeDir = -this.strafeDir;
    d.groundVelSet((d.position.x - x0) / dt, (d.position.z - z0) / dt);
  }

  /** A heavy blow is coming (a charge well under way, the cleave in flight, the finisher's raise):
   *  once per 3 s he may step out of it (TUNING.guard.evade): a sidestep out of a charge's line, a
   *  backstep from a blow already on its way. From his footwork, or breaking off the late part of a
   *  recovery (_act). True if he went. */
  _evade(s) {
    const d = this.d, pl = d.game.player;
    if (!pl || this.sideCool > 0 || !s || !(s.dist < 6)) return false;
    const charging = pl.state === 'charge' && fin(pl.chargeK) > 0.55;
    const coming = pl.state === 'heavy' || (pl.state === 'attack' && !!pl.atk?.def?.heavy && !pl.atk.exec);
    if (!charging && !coming) return false;
    this.sideCool = 3;
    if (!(Math.random() < (this.T.guard.evade ?? 0.45))) return false;
    return this.startReact(coming && s.dist < 3 ? 'backstep' : 'sidestep');
  }

  /** A weighted pick of the moves he can use from `dist` (phase, band, cooldown; recent picks damped).
   *  `punish` (the hero drinks): the moves that cover ground (a dash, a leap, the qi) weigh more. */
  _choose(dist, punish = false) {
    const d = this.d, P = this.P;
    // (the director, with a pressure block: the floors first; then each weight is its say)
    if (P) prepareChoose(this, dist);
    let total = 0;
    const pool = [];
    for (const name of this.names) {
      const def = this.M[name];
      if (def.counter || def.transition || def.phase > d.phase || def.manual) continue;
      if ((this.cooldowns[name] ?? 0) > 0) continue;
      const [lo, hi] = def.band;
      if (dist < lo || dist > hi) continue;
      let w = perPhase(def.weight, d.phase);
      // the actor's own say on it right now (a move that needs a piece of the level in reach, a mood): 0 = not now
      if (w > 0 && d.weigh) w = d.weigh(name, def, w, dist);
      if (!(w > 0)) continue;
      if (this.last[0] === name) w *= 0.3;
      else if (this.last[1] === name) w *= 0.65;
      if (punish && (def.gapCloser || def.beats.some((b) => b.dash?.max >= 3 || b.leap || b.release))) w *= this.T.punish.weight;
      if (P) w = directWeight(this, name, def, w, dist);
      if (!(w > 0)) continue;
      pool.push([name, w]);
      total += w;
    }
    if (!(total > 0)) return null;
    let r = Math.random() * total;
    for (const [name, w] of pool) {
      r -= w;
      if (r <= 0) return name;
    }
    return pool[pool.length - 1][0];
  }

  // ---------------------------------------------------------------- the move timeline
  _act(dt) {
    const d = this.d, a = this.act;
    a.t += dt;
    const t = a.t;
    const s = this._sense();
    // a blow the fairness guard holds: through its hold the pose stands still (the clip lags behind
    // the move's clock by what the hold has run)
    const hb = a.hb;
    if (hb?.hl > 0) {
      const lag = clamp(t - hb.hf, 0, hb.hl) - clamp(t - dt - hb.hf, 0, hb.hl);
      if (lag > 0) this.clipT -= lag;
    }
    // the beat that owns this moment (its windup or active frames), else the next one
    let cur = null;
    for (const b of a.beats) {
      if (t < b.end + 1e-6) {
        cur = b;
        break;
      }
    }
    a.striking = cur && !cur.feint && t >= cur.impact - 0.12 ? cur : a.striking && t <= a.striking.end + 0.12 ? a.striking : null;
    // tells: the announcement at each real beat's windup start, the glint flashLead before its impact
    for (const b of a.beats) {
      if (b.feint) continue;
      // a release that carries a `zone` (the sword qi as a string's last word): with the hero inside
      // that reach as its cue comes due, the cut that would have thrown the qi lands on him instead
      // (b.cut: cued, flashed, held by the guard, timed and answered as a blade's blow of its tell; no
      // qi is thrown); outside it, a release as any other. Decided once.
      if (b.cut === undefined && b.def.release && b.def.zone && t >= b.flash) b.cut = !!s && this._inZone(b.def.zone, s);
      // (a release's throw: the fairness guard looks at it where its cue would be, flashLead before
      // the release, by when it will reach the hero)
      if (this.P && throwsAt(b) && !b.relChecked && t >= b.flash) {
        if (this._holdBeat(a, b, t)) continue;
        b.relChecked = true;
        if (b.tellHeld && !b.announced) this._announce(a, b, t);
      }
      if (!b.announced && !b.tellHeld && t >= b.tellAt) {
        // (a blow the fairness guard could already not clear is not announced yet: it is announced
        // when the guard clears it at its cue, or never if it becomes a feint: a feint the guard
        // makes then says nothing, as an authored feint says nothing)
        // (a draw is announced with its click: the honor gate may still make it a feint)
        if (b.def.draw || (this.P && this._tellRisk(a, b, t))) b.tellHeld = true;
        else this._announce(a, b, t);
      }
      if (!b.flashed && t >= b.flash && (!b.def.release || b.cut) && !b.def.cast?.selfCue) {
        // (the honor gate, ADR-144: a draw waits at the cock for a hero who cannot answer it, then feints)
        if (b.def.draw && this._honor(a, b, t, dt)) {
          if (this.act !== a) return;
          continue;
        }
        // (the fairness guard: a blow that would land within 0.3 s of one needing the other answer waits)
        if (this.P && this._holdBeat(a, b, t)) continue;
        if (b.tellHeld && !b.announced) this._announce(a, b, t);
        b.flashed = true;
        const p = d.tellPoint(b.def.part, d._v2);
        // perilous: a thrust a mikiri answers (its own read: the deep low coil, the held beat)
        d.emit('combat:flash', { source: 'dragon', attack: a.name, tell: b.def.tell, x: p.x, y: p.y, z: p.z, perilous: !!b.def.mikiri, flare: isFlare(b.def.tell, b.def.flare) });
        // the cue: a white glint, or THE FLARE of a moment (red / black: dodge; a blue blow marked
        // `flare`: parry). It is the only sign: no glow through the windup and nothing drawn on the
        // floor under his own blow (ADR-118; a red area used to ring the ground: `ring` is still its
        // radius, for the shake as it lands)
        d.fx.tellFlash(b.def.tell, p.x, p.y, p.z, 1, !!b.def.flare);
        if (dodgeOnly(b.def.tell)) {
          d.warnTell = b.def.tell;
          d.warn = TELL_STYLE[b.def.tell].warn.spike;
        }
        if (FLOOR && b.def.ring) d.fx.ringPulse(d.position.x, d.position.z, b.def.ring);
      }
      // the blow through the air (dragon:attack, attackSound.js): once per real blow, `lead` s before
      // its impact and never before its glint (a hold or the honor gate may still move the impact until
      // then). Reads only: no RNG, no timing.
      if (!b.sounded && b.flashed && !a.def.transition && t >= b.impact - ATTACK_SOUND.lead) {
        b.sounded = true;
        const snd = beatSound(this.T.weapon, b.def);
        if (snd) {
          const e = this._atk;
          e.name = a.name;
          e.weapon = snd.weapon;
          e.weight = snd.weight;
          e.shape = snd.shape;
          e.tell = b.def.tell ?? TELL.NORMAL;
          e.impactIn = Math.max(0, b.impact - t);
          e.x = d.position.x;
          e.z = d.position.z;
          d.emit('dragon:attack', e);
        }
      }
    }
    if (FLOOR && cur && !cur.feint && cur.def.ring && t < cur.impact) {
      // (TELL_STYLE.red.floor: the red ground warning of an area, from the windup start to the impact)
      const k = clamp((t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1);
      const c = this.leap?.beat === cur ? this.leap.target : d.position;
      d.fx.warnRing(c.x, c.z, cur.def.ring, k, dt);
    }
    if (cur && !cur.feint && cur.def.tell === TELL.BLACK && t < cur.flash) {
      // a black blow CHARGES: darkness is drawn into the striking part through the windup, thicker
      // toward the cue, and his body darkens with it
      const W = TELL_STYLE.black.warn, k = smoothstep(cur.start, cur.flash, t);
      const p = d.tellPoint(cur.def.part, d._v2);
      d.fx.charge(p.x, p.y, p.z, k, dt);
      d.warnTell = TELL.BLACK;
      d.warn = Math.max(d.warn, W.from + (W.to - W.from) * k);
      if (!cur._charging) {
        cur._charging = true;
        d.emit('combat:charge', { source: 'dragon', attack: a.name, dur: Math.max(0.05, cur.flash - t), x: p.x, z: p.z });
      }
    }
    // a string's next hit: if the hero is gone out of its reach (it can step in `close` m, dash its
    // `dash.max`), the string stops there and he gives chase instead of cutting at air
    if (cur && !cur.checked && cur.hit > 0 && t >= cur.start && s && this.aiEnabled) {
      cur.checked = true;
      if (s.dist > this._reach(cur) + 0.5) {
        // (with a pressure block: a `far` / `away` link of the string is his pursuit)
        if (this.P && this._linkNow(a, s, true)) return;
        this._toFoot(0);
        return;
      }
    }
    // (pressure.pursue: the reach watch, through the windup up to the glint; see the header)
    if (cur && s && this.P?.pursue && this.aiEnabled && this._outOfReach(a, cur, t, s)) {
      this.stats.stops++;
      this.runner = Math.min(this.P.pursue.habitMax ?? 3, this.runner + 1);
      if (this._linkNow(a, s, true)) return;
      this._toFoot(this.P.pursue.gap ?? 0);
      return;
    }
    if (cur) this._motion(cur, t, dt, s);
    // the late part of his recovery (his guard is back): he may break it off to step out of a heavy blow
    if (!cur && this.aiEnabled && !a.def.transition && this.guardUp() && this._evade(s)) return;
    // the hits: the zone through the active frames, one result per beat
    for (const b of a.beats) {
      // a counter stance that caught nothing by its impact: the move ends there (the beats after it
      // were its punish), and he is open
      if (b.def.stance && !b.caught && !b.catchOver && t >= b.impact) {
        b.catchOver = true;
        this._stanceMiss(a, b);
        return;
      }
      if (b.feint || b.done || t < b.impact) continue;
      if (!b.struck) {
        b.struck = true; // the impact's first frame: the actor's own FX (a bolt, a shock ring)
        // (the cover the hero stands behind, for a line of the Void: found first, the FX draw to it)
        b.cover = this._coverFor(b, s);
        d.onImpact?.(b, s, a);
        // (the floor's mark of this blow, from its data: the world blow then lays none of its own)
        const gm = this._groundOf(b);
        if ((!b.def.release || b.cut) && !b.def.cast && !b.def.selfHit && !b.def.draw) this._worldBlow(b, !!gm);
        if (gm) d.game.world?.groundBlow?.(gm.x, gm.z, gm);
      }
      // (a beat whose hits the actor deals itself: no zone result here; it is over at its end)
      if (b.def.selfHit) {
        if (t >= b.end - 1e-6) b.done = true;
        continue;
      }
      if (b.def.release && !b.cut) {
        b.done = true;
        d.onRelease?.(b, s, a);
        continue;
      }
      if (b.def.cast) {
        b.done = true;
        d.onCast?.(b, s, a);
        if (this.act !== a) return;
        continue;
      }
      // (a sustained beat's one result comes in its active frames: its lit window is the ticks')
      if (t > b.end - (b.S || 0) + dt * 0.5) {
        b.done = true; // a whiff
        // (a blow of his flurry that reached nobody: the hero stood his ground and it fell short, or
        // he left: duelist.onStreakBlow settles which, so the flurry always ends one way or the other)
        if (a.streak && !b.feint) d.onStreakBlow(a, b, null, !!s && s.dist <= fin(b.def.zone?.r, 2.3) + 1.2);
        continue;
      }
      this.zone = b.def.zone;
      if (s && this._inZone(b.def.zone, s, !!b.def.air)) {
        if (b.cover) {
          b.done = true; // the cover took it: the hero behind it is untouched
          continue;
        }
        const r = d.hitPlayer({
          damage: b.def.damage, knockback: b.def.knockback, knockdown: !!b.def.knockdown, kind: 'slash', tell: b.def.tell, attack: a.name,
          from: { x: d.position.x, z: d.position.z }, mikiri: !!b.def.mikiri, beat: b,
        });
        if (r !== RESULT.IGNORED) {
          if (a.streak) d.onStreakBlow(a, b, r);
          b.done = true;
          b.landed = r === RESULT.HIT;
          if (r === RESULT.HIT || r === RESULT.BLOCKED) a.chain = 0;
          if (b.def.ring) d.game.shake?.(0.25);
          // (`stopOn`, ADR-144: a draw blocked or landed ends the move)
          if (b.def.stopOn && this.act === a && this._stopOn(a, b, r)) return;
        }
        if (this.act !== a) return; // a parry recoiled him
      }
    }
    // a sustained beat's lit window: the actor's tick every `sustain.tick` s (whatever the one result was)
    for (const b of a.beats) {
      const S = b.def.sustain;
      if (!S || b.feint || t < b.impact || b.sOver) continue;
      const tick = Math.max(0.02, S.tick ?? 0.2);
      if (b.sNext === undefined) b.sNext = b.impact + tick;
      if (t >= b.end) b.sOver = true;
      else if (t >= b.sNext) {
        b.sNext += tick;
        d.onSustain?.(b, s, a, clamp((t - b.impact) / Math.max(1e-4, b.S || S.dur || 1), 0, 1));
        if (this.act !== a) return;
      }
    }
    if (this.P && this.act === a && !a.def.transition) {
      // the director's flow (a pressure block): as the recovery starts, what comes next is decided
      // once (a link, the old flow roll, or the breather after chainDepth moves in a row); it starts
      // at its `cut` of the recovery
      if (!a.planned && t >= a.recoveryStart) {
        a.planned = true;
        this._planNext(a, s);
      }
      const N = a.next;
      if (N && t >= N.at && s) {
        a.next = null;
        if (this._startNext(a, N, s, t < a.end - 1e-4)) return;
      }
    }
    if (this.act === a && t >= a.end) {
      if (a.def.transition) d.onTransitionEnd?.(a);
      if (this.P && !a.def.transition) {
        if (a.rest) {
          // chainDepth moves in a row: a breather of footwork
          this._toFoot(this._gap(this.P.chainRest ?? this.T.idleGap));
          this.stats.rests++;
        } else this._toFoot();
        return;
      }
      // PBZ pace: he often flows straight into another move (TUNING.chain), no footwork between
      if (!a.def.transition && !a.def.counter && this.aiEnabled && !this.pendingPhase && s && Math.random() < perPhase(this.T.chain, d.phase)) {
        const next = this._choose(s.dist);
        if (next && next !== a.name && this.startAct(next)) return;
      }
      this._toFoot();
    }
  }

  /**
   * A beat's `stopOn` (ADR-144): answered as it names ('blocked' / 'hit'), the move ends there: the
   * actor hears it (d.onStopOn(a, b, r)), the later beats are spent and the timeline goes to the
   * recovery. True if it stopped (the caller returns: this frame's hits are over).
   */
  _stopOn(a, b, r) {
    const why = r === RESULT.BLOCKED ? 'blocked' : r === RESULT.HIT ? 'hit' : null;
    if (!why || !b.def.stopOn.includes(why)) return false;
    this.d.onStopOn?.(a, b, r);
    if (this.act !== a) return true;
    a.stopped = why;
    for (const x of a.beats) {
      if (x.index <= b.index) continue;
      x.feint = true;
      x.done = true;
    }
    if (a.t < a.recoveryStart) this.skipTo(a.recoveryStart);
    return true;
  }

  /** Links and the flow are his own: not with the AI off, a phase change waiting, a test or the Lab
   *  holding him (a breather set over `pressure.holdGap`, 5 s), or the hero drinking (the punish). */
  _mayFlow(s) {
    return !!s && this.aiEnabled && !this.pendingPhase && !(this.gapT > (this.P?.holdGap ?? 5)) && this.d.game.player?.state !== 'heal';
  }

  /** As move `a`'s recovery starts: its link, else the old flow roll, else nothing (footwork);
   *  after pressure.chainDepth moves in a row, the breather instead (a.rest). */
  _planNext(a, s) {
    const P = this.P, ph = this.d.phase;
    if (!this._mayFlow(s)) return;
    if (this.chainN + 1 >= perPhase(P.chainDepth ?? 99, ph)) {
      a.rest = true;
      return;
    }
    const span = a.end - a.recoveryStart;
    const L = linkFor(this, a, s);
    if (L) {
      a.next = { to: L.to, link: L, at: a.recoveryStart + clamp(L.cut ?? P.linkCut ?? 1, 0, 1) * span };
      return;
    }
    if (!a.def.counter && Math.random() < perPhase(this.T.chain, ph)) a.next = { to: null, link: null, at: a.recoveryStart + clamp(P.chainCut ?? 1, 0, 1) * span };
  }

  /** Start what _planNext decided (`cut`: before the recovery's end). False: nothing started (the
   *  link's target stopped being usable, the flow found nothing), the move ends as usual. */
  _startNext(a, N, s, cut) {
    if (!this._mayFlow(s)) return false;
    let name = N.to;
    if (N.link) {
      if (!linkUsable(this, N.link, s)) return false;
    } else {
      name = this._choose(s.dist);
      if (!name || name === a.name) return false;
    }
    const n = this.chainN + 1;
    if (!this.startAct(name)) return false;
    this.chainN = n;
    booked(this, name);
    if (N.link) this.stats.links++;
    else this.stats.chains++;
    if (cut) this.stats.cuts++;
    return true;
  }

  /** A link out of a string the hero left (its pursuit: `far` / `away` links only), now. */
  _linkNow(a, s, pursuit) {
    if (!this._mayFlow(s) || this.chainN + 1 >= perPhase(this.P.chainDepth ?? 99, this.d.phase)) return false;
    const L = linkFor(this, a, s, pursuit);
    return !!L && this._startNext(a, { to: L.to, link: L, at: 0 }, s, false);
  }

  /** Root motion of the current beat: tracking the hero in the windup, travel, dash, leap. */
  _motion(b, t, dt, s) {
    const d = this.d, D = b.def, u = uAt(b, t);
    const trackUntil = D.track ?? 0.75;
    const left = Math.max(b.impact - t, dt);
    const L = s ? this._lead(s, left) : null;
    if (L && u < trackUntil && !this.leap) d.yaw = turnToward(d.yaw, L.ang, perPhase(this.T.move.trackTurn, d.phase) * dt);
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const x0 = d.position.x, z0 = d.position.z;
    // close-in: through the windup he steps in toward the hero (at most b.close m), arriving at the
    // impact where the zone reaches him: a cut is never thrown at air, and the lunge reads as the tell
    // (not before a SIGN's vanish: he stands for the sign, and closes from where he arrives)
    // (`closeBy` on a beat, opt-in, a number or a function read live: the u of the windup the close-in is
    // done by, so he stands still for the rest of it; Tian Lei's sweep under ?ascMotion=b, ADR-248: he
    // drops onto a planted foot and turns on it. Without it: by the impact, as always)
    const cb = typeof D.closeBy === 'function' ? D.closeBy() : D.closeBy;
    const tc = cb > 0 && cb < 1 && b.at ? Math.min(b.impact, b.at(cb)) : b.impact;
    if (b.close > 0 && L && u >= 0.15 && t < tc && !this.leap && !(D.blink?.sign && !b._blinked)) {
      const gap = L.dist - this._ideal(D.zone);
      // (pressure.pursue: a hero backing away is chased with closeK x the step-in)
      const budget = b.close * (this._chasing(s) ? perPhase(this.P.pursue.closeK ?? 1, d.phase) : 1) - (b.closed ?? 0);
      if (gap > 0.02 && budget > 0) {
        const step = Math.min(Math.min(gap / Math.max(tc - t, dt), this.T.close.speed) * dt, budget, gap);
        b.closed = (b.closed ?? 0) + step;
        d.moveBy((L.dx / (L.dist || 1)) * step, (L.dz / (L.dist || 1)) * step);
      }
    }
    // a flurry's later blows: he is gone, and at another side of the hero (duelist.flit)
    if (D.flit && !b._flit && s) {
      b._flit = true;
      d.flit(s, D.flit, b.hit);
    }
    if (D.travel) {
      const prev = b._trav ?? 0, now = track(D.travel, u);
      b._trav = now;
      d.moveBy(fx * (now - prev), fz * (now - prev));
    }
    if (D.dash && u >= D.dash.from) {
      if (!b._dash) {
        const ax = L ? L.dx : fx, az = L ? L.dz : fz, dist = L ? L.dist : 0;
        const l = Math.hypot(ax, az) || 1;
        if (s) d.yaw = Math.atan2(ax, az);
        // (pressure.pursue: a hero backing away: the length cap x dashK)
        const cap = D.dash.max * (this._chasing(s) ? perPhase(this.P.pursue.dashK ?? 1, d.phase) : 1);
        b._dash = { x: d.position.x, z: d.position.z, dx: ax / l, dz: az / l, len: clamp(dist - (D.dash.stop >= 0 ? Math.max(D.dash.stop, strikeGapFloor(d, D.zone)) : D.dash.stop), 0, cap), done: 0 }; // (?strikeGap: not a dash through him)
      }
      const k = ease(clamp((u - D.dash.from) / Math.max(1e-4, D.dash.to - D.dash.from), 0, 1));
      const want = b._dash.len * k, step = want - b._dash.done;
      b._dash.done = want;
      d.moveBy(b._dash.dx * step, b._dash.dz * step);
    }
    if (D.leap) this._leap(b, u, s);
    else if (D.lift) d.position.y = Math.max(0, track(D.lift, u));
    d.beatMotion?.(b, u, s, dt);
    d.groundVelSet((d.position.x - x0) / Math.max(dt, 1e-4), (d.position.z - z0) / Math.max(dt, 1e-4));
  }

  /** How far off a zone wants the hero at the impact (its centre of reach). */
  _ideal(z) {
    if (!z) return 1.5;
    const f = z.fwd || 0; // (a zone ahead of him: its centre of reach is that much further)
    if (z.kind === 'ring') return z.r * 0.55 + f;
    return z.r * (z.kind === 'line' ? 0.72 : 0.66) + f;
  }

  /** The furthest the hero can be at beat b's windup start and still be hit (zone + step-in + dash). */
  _reach(b) {
    if ((b.def.release && !b.cut) || b.def.cast) return Infinity; // a thrown thing reaches him wherever he is
    const z = b.def.zone, pr = this.d.game.player?.radius ?? 0.45;
    return (z?.r ?? 2) + Math.max(0, z?.fwd || 0) + pr + (b.close ?? 0) + (b.def.dash?.max ?? 0);
  }

  // ---------------------------------------------------------------- the pursuit (pressure.pursue)
  /** The hero's speed away from him (m/s; negative: coming in). */
  forecast(s = this._sense()) {
    return s ? (s.vx * s.dx + s.vz * s.dz) / (s.dist || 1) : 0;
  }

  /** Is he chasing a hero who backs away (faster than pressure.pursue.away m/s)? */
  _chasing(s) {
    const PU = this.P?.pursue;
    return !!PU && !!s && this.forecast(s) > (PU.away ?? 1.2);
  }

  /** What beat b can still reach at time t (m from his root): the zone, the step-in left (at the
   *  close-in speed, in the time left), the dash not yet spent; Infinity for a blow whose reach is
   *  wherever the hero is (a leap, a thrown thing, a blink before he has blinked). */
  _reachLeft(b, t, s) {
    const D = b.def;
    if (D.leap || (D.release && !b.cut) || D.cast) return Infinity;
    // (a blink: wherever the hero is until he has gone; from where he arrives, the blow's own reach)
    if (D.blink ? !b._blinked : !Number.isFinite(this._reach(b))) return Infinity;
    const z = D.zone, pr = this.d.game.player?.radius ?? 0.45, PU = this.P?.pursue ?? {};
    const chase = this._chasing(s), left = Math.max(0, b.impact - t), ph = this.d.phase;
    const close = Math.min(Math.max(0, (b.close ?? 0) * (chase ? perPhase(PU.closeK ?? 1, ph) : 1) - (b.closed ?? 0)), this.T.close.speed * left);
    let dash = 0;
    if (D.dash) dash = b._dash ? Math.max(0, b._dash.len - b._dash.done) : D.dash.max * (chase ? perPhase(PU.dashK ?? 1, ph) : 1);
    return (z?.r ?? 2) + Math.max(0, z?.fwd || 0) + pr + close + dash;
  }

  /** The reach watch (pressure.pursue): beat b of move a, before its glint, with the hero led to its
   *  impact beyond what it can still reach by `margin` m. */
  _outOfReach(a, b, t, s) {
    const PU = this.P.pursue, D = b.def;
    if (b.feint || b.flashed || D.stance || D.draw || a.def.transition || a.def.counter || a.streak) return false;
    if (t < b.start + (PU.after ?? 0.06) || t >= b.flash) return false;
    if (!D.zone || D.release || D.cast || D.selfHit) return false;
    const L = this._lead(s, b.impact - t), d = this.d, z = D.zone, m = PU.margin ?? 0.5;
    // (he keeps to his bound: a hero led past it by more than the zone's own reach is out of reach of
    // any step, dash, blink or leap of his)
    const beyond = Math.hypot(d.position.x + L.dx, d.position.z + L.dz) - (d.bound ?? Infinity);
    if (beyond > z.r + Math.max(0, z.fwd || 0) + (d.game.player?.radius ?? 0.45) + m) return true;
    return L.dist > this._reachLeft(b, t, s) + m;
  }

  /** Heaven-Splitting Fall: the ring follows the hero until `lock`, he comes down on it at u = 1. */
  _leap(b, u, s) {
    const d = this.d, L = b.def.leap;
    if (u < L.from) return;
    if (!this.leap || this.leap.beat !== b) {
      this.leap = { beat: b, x: d.position.x, z: d.position.z, target: { x: d.position.x, z: d.position.z } };
      d.emit('dragon:takeoff');
    }
    const J = this.leap;
    if (s && u < L.lock) {
      // the landing spot follows the hero, inside his bound (pressure.pursue.leapLead: where he is going)
      const B = d.bound, ll = this.P?.pursue?.leapLead ?? 0, k = ll > 0 ? Math.min(ll, Math.max(0, b.impact - (this.act?.t ?? b.impact))) : 0;
      let tx = s.p.x + s.vx * k, tz = s.p.z + s.vz * k;
      const r = Math.hypot(tx, tz);
      if (r > B) {
        tx *= B / r;
        tz *= B / r;
      }
      // `short` (m, opt-in): he lands that far short of the hero, so his blade, not his body, meets him
      const sh = L.short ?? 0, gx = tx - J.x, gz = tz - J.z, D = Math.hypot(gx, gz);
      if (sh > 0 && D > 1e-3) {
        const f = Math.max(0.4 * D, D - sh) / D;
        tx = J.x + gx * f;
        tz = J.z + gz * f;
      }
      J.target.x = tx;
      J.target.z = tz;
      d.clampTarget?.(J.target); // (a boss whose floor is not a circle)
      // (`leap.stop`, opt-in, ADR-249: he comes down this many m short of the hero along his line, so a
      // heel or fists that strike ahead of him land on the hero, not him; 0 / none: on the hero, as before)
      const st = L.stop > 0 ? L.stop : 0;
      if (st) {
        const ox = J.target.x - J.x, oz = J.target.z - J.z, ol = Math.hypot(ox, oz);
        if (ol > st + 1e-3) {
          J.target.x -= (ox / ol) * st;
          J.target.z -= (oz / ol) * st;
        }
      }
    }
    const k = clamp((u - L.from) / Math.max(1e-4, 1 - L.from), 0, 1);
    const e = ease(k);
    d.position.x = J.x + (J.target.x - J.x) * e;
    d.position.z = J.z + (J.target.z - J.z) * e;
    d.position.y = u >= 1 ? 0 : L.apex * 4 * k * (1 - k);
    const dx = J.target.x - J.x, dz = J.target.z - J.z;
    if (dx * dx + dz * dz > 0.04 && u < 1) d.yaw = Math.atan2(dx, dz);
    d.state = d.position.y > 0.4 ? 'airborne' : 'combat';
    if (u >= 1 && !J.landed) {
      J.landed = true;
      d.state = 'combat';
      d.emit('dragon:land', { x: d.position.x, z: d.position.z });
      d.fx.dust(d.position.x, d.position.z, 1.6);
      d.game.world?.gust?.(d.position.x, d.position.z, 1.2, 5);
    }
  }

  /**
   * The cover between him and the hero for a line of the Void (a bolt, the pull, the grip; ADR-107),
   * or null. The cover answers for the hero: a bolt blasts it, the pull drags it down toward him, the
   * grip crushes it.
   */
  _coverFor(b, s) {
    const D = b.def, d = this.d;
    if (!(D.bolt || D.pull || D.grip) || !s || !this._inZone(D.zone, s)) return null;
    const W = d.game.world?.destructibles, p = d.game.player?.position;
    if (!W?.coverAt || !p) return null;
    const c = W.coverAt(d.position.x, d.position.z, p.x, p.z, 0.2);
    if (!c) return null;
    const WT = this.T.world ?? DUEL_WORLD;
    if (D.pull) W.topple(c, d.position.x - c.x, d.position.z - c.z, 'boss');
    else {
      const o = (this._wb ??= { kind: 'blast', by: 'boss', dx: 0, dz: 0, y: 1, src: -1, scar: false });
      o.kind = 'blast';
      o.dx = c.x - d.position.x;
      o.dz = c.z - d.position.z;
      o.src = W.swing();
      W.strike(c.x, c.z, 0.2, D.grip ? WT.grip ?? DUEL_WORLD.grip : WT.bolt ?? DUEL_WORLD.bolt, o);
    }
    return c;
  }

  /**
   * A blade's blow meets the world (ADR-107): what stands in the beat's zone is chipped or cut down,
   * as hard as the blow (its damage / T.world.per; a red blow harder). A ring or a blow that knocks
   * down bites stone as a blunt blow and cracks the floor.
   */
  _worldBlow(b, marked = false) {
    const d = this.d, w = d.game.world, z = b.def.zone;
    const W = w?.destructibles;
    if (!W?.strike || !z || b.def.bolt || b.def.pull || b.def.grip || b.def.noWorld || (d.position.y > 0.6 && !b.def.air)) return;
    const WT = this.T.world ?? DUEL_WORLD;
    const heavy = z.kind === 'ring' || !!b.def.ring || !!b.def.knockdown;
    const power = ((b.def.damage ?? 12) / (WT.per ?? DUEL_WORLD.per)) * (b.def.tell === TELL.RED ? WT.red ?? DUEL_WORLD.red : 1);
    const o = (this._wb ??= { kind: 'cut', by: 'boss', dx: 0, dz: 0, y: 1, src: -1, scar: false, marked: false });
    o.kind = heavy ? 'blunt' : 'cut';
    o.marked = marked; // (the beat's own floor mark is laid by groundBlow: the crack under a heavy blow is not doubled)
    o.src = W.swing();
    o.scar = heavy;
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), zf = z.fwd || 0, zs = z.side || 0;
    // (a zone ahead of him / to his side: it bites the world round its own centre)
    const x = d.position.x + fx * zf + fz * zs, zz = d.position.z + fz * zf - fx * zs;
    if (z.kind === 'ring') {
      o.dx = o.dz = NaN; // (outward from him)
      w.impact?.(x, zz, z.r, power, o);
    } else if (z.kind === 'line') {
      o.dx = fx;
      o.dz = fz;
      W.sweep(x + fx * 0.4, zz + fz * 0.4, x + fx * z.r, zz + fz * z.r, z.w / 2, power, o);
      if (heavy) w.impact?.(x + fx * z.r * 0.8, zz + fz * z.r * 0.8, 0.6, power, o);
    } else {
      o.dx = fx;
      o.dz = fz;
      const cx = x + fx * z.r * 0.6, cz = zz + fz * z.r * 0.6;
      if (heavy) w.impact?.(cx, cz, z.r * 0.55, power, o);
      else W.strike(cx, cz, z.r * 0.55, power, o);
    }
  }

  /**
   * The mark this beat leaves on the FLOOR at its impact (worldTuning.js DUEL_MARK: a beat's own
   * `groundMark`, else read from its shape), as a reused world.groundBlow record { x, z, kind, power,
   * r, dx, dz, len, arc, by }, or null. It changes nothing in the fight: no damage, no fire, no draw
   * from Math.random. Beats whose thing goes out (a release, a cast, a beam, a draw) mark only by
   * their own `groundMark` (the actor marks where it lands).
   */
  _groundOf(b) {
    const D = b.def, d = this.d, G = D.groundMark;
    if (G === false || b.feint || !d.game.world?.groundBlow) return null;
    const own = G && typeof G === 'object' ? G : null;
    if (!own && (D.selfHit || D.draw || D.cast || (D.release && !b.cut) || D.bolt || D.pull || D.grip || D.noWorld)) return null;
    if (!own && d.position.y > 0.6) return null; // (still in the air: it met nothing)
    const z = D.zone;
    if (!z && !own) return null;
    const M = this.T.marks ? { ...DUEL_MARK, ...this.T.marks } : DUEL_MARK;
    const WT = this.T.world ?? DUEL_WORLD;
    const base = ((D.damage ?? 12) / (WT.per ?? DUEL_WORLD.per)) * (D.tell === TELL.RED || D.tell === TELL.BLACK ? WT.red ?? DUEL_WORLD.red : 1);
    if (!(base > 0) && !own?.power) return null;
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const zf = z?.fwd || 0, zs = z?.side || 0, r = z?.r ?? 2;
    const heavy = z?.kind === 'ring' || !!D.ring || !!D.knockdown || D.tell === TELL.RED || D.tell === TELL.BLACK;
    const landing = !!(D.leap || D.dive || D.blink?.land || this._landsAt(D));
    const low = this._bladeLow(D) <= M.low;
    const dash = Number(D.dash?.max) || 0;
    let kind = own?.kind ?? null, fwd = zf, side = zs, len = NaN, arc = 0, rr = NaN, pk = 1;
    if (!kind) {
      if (z?.kind === 'ring' && r >= M.bigRing) kind = 'blast';
      else if (landing) kind = low && z?.kind !== 'ring' ? 'cut' : 'slam';
      else if (heavy && z?.kind === 'ring') {
        if (D.part === 'feet') {
          kind = 'dash'; // (an ankle sweep: the leg's scuffed arc round him)
          arc = Math.max(0.8, r * 0.55);
        } else {
          kind = 'slam';
          if (!zf) fwd = 0.5; // (the fists / the heel come down before him, not under his root)
        }
      } else if (low) kind = 'cut';
      else if (dash >= M.dash) kind = 'dash';
      else return null;
    }
    switch (kind) {
      case 'slam':
        pk = M.slam;
        rr = z?.kind === 'ring' ? Math.min(r * 0.5, 2) : NaN;
        break;
      case 'blast':
        pk = M.blast;
        rr = Math.min(r * 0.35, 2.4);
        break;
      case 'cut':
        pk = M.cut;
        fwd += z?.kind === 'ring' ? 0.4 : r * 0.42;
        len = Math.min(M.cutLen[1], Math.max(M.cutLen[0], r * 0.75));
        break;
      case 'thrust':
        pk = M.thrust;
        fwd += Math.min(1.4, r * 0.6);
        break;
      case 'dash':
        if (arc > 0) {
          pk = M.sweep;
          len = arc * Math.PI * 2 * M.sweepArc;
        } else {
          pk = M.skid;
          len = Math.min(M.skidLen[1], Math.max(M.skidLen[0], dash * 0.3));
          fwd -= len; // (the furrow runs up to where he stands)
        }
        break;
      default:
        break;
    }
    const o = (this._gm ??= { x: 0, z: 0, kind: 'slam', power: 0, r: NaN, dx: 0, dz: 0, len: NaN, arc: false, claws: 0, by: 'boss', hot: false });
    if (own) {
      if (Number.isFinite(own.fwd)) fwd = own.fwd;
      if (Number.isFinite(own.side)) side = own.side;
      if (Number.isFinite(own.len)) len = own.len;
      if (Number.isFinite(own.r)) rr = own.r;
      if (own.arc) arc = Number.isFinite(own.arc) ? own.arc : Math.max(0.8, r * 0.55);
    }
    o.x = d.position.x + fx * fwd + fz * side;
    o.z = d.position.z + fz * fwd - fx * side;
    o.kind = kind;
    o.power = Number.isFinite(own?.power) ? own.power : base * pk;
    o.r = rr;
    o.len = len;
    o.arc = arc > 0;
    if (arc > 0) {
      // (an arc runs round his zone's centre, starting off his right hand)
      o.r = arc;
      o.dx = -fz;
      o.dz = fx;
    } else {
      o.dx = fx;
      o.dz = fz;
    }
    o.claws = own?.claws | 0;
    o.hot = !!own?.hot;
    o.by = 'boss';
    return o.power > 0 ? o : null;
  }

  /** A beat whose lift comes down at its impact (a hop, a leap, a somersault that lands its blow). */
  _landsAt(D) {
    const L = D.lift;
    if (!Array.isArray(L) || L.length < 2) return false;
    let up = 0, atImpact = NaN;
    for (const k of L) {
      if (!Array.isArray(k)) continue;
      if (k[0] < 0.999 && k[1] > up) up = k[1];
      if (k[0] >= 0.999 && k[0] <= 1.2 && !Number.isFinite(atImpact)) atImpact = k[1];
    }
    return up >= 0.45 && Number.isFinite(atImpact) && atImpact <= 0.08;
  }

  /** The lowest blade elevation (rad, the pose's `sw[1]`) at or just after the beat's impact; +Inf
   *  for a beat with no blade. (Memoised per beat definition.) */
  _bladeLow(D) {
    const C = (this._lowOf ??= new WeakMap());
    let v = C.get(D);
    if (v !== undefined) return v;
    v = Infinity;
    for (const k of D.keys ?? []) {
      const u = k?.[0], p = k?.[1];
      if (!(u >= 0.99 && u <= 1.7) || !Array.isArray(p?.sw)) continue;
      if (Number.isFinite(p.sw[1])) v = Math.min(v, p.sw[1]);
    }
    C.set(D, v);
    return v;
  }

  /** Is the hero inside the zone (his position and facing, the hero's radius)? `air`: the beat is
   *  tested whatever his height (else nothing hits while he is above 0.6 m). A zone may sit `fwd` m
   *  ahead of him and `side` m to his left (its centre: a limb's reach, not his root's). */
  _inZone(z, s, air = false) {
    if (!z) return false;
    const d = this.d, pr = d.game.player?.radius ?? 0.45;
    if (d.position.y > 0.6 && !air) return false; // still in the air
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    let dx = s.dx, dz = s.dz, dist = s.dist, ang = s.ang;
    if (z.fwd || z.side) {
      const f = z.fwd || 0, sd = z.side || 0;
      dx -= fx * f + fz * sd;
      dz -= fz * f - fx * sd;
      dist = Math.hypot(dx, dz);
      ang = Math.atan2(dx, dz);
    }
    if (z.kind === 'ring') return dist <= z.r + pr;
    const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
    if (z.kind === 'line') return along >= -pr && along <= z.r + pr && Math.abs(across) <= z.w / 2 + pr;
    // sector
    if (dist > z.r + pr) return false;
    if (dist < pr + 0.3) return true;
    return Math.abs(wrapAngle(ang - d.yaw)) <= z.ang + Math.asin(Math.min(1, pr / Math.max(dist, 1e-3)));
  }

  /** The Lab's hitbox overlay: the zone being tested this frame as a sphere. */
  zoneDebug() {
    const z = this.zone, d = this.d;
    if (!z) return null;
    const r = z.r ?? 1, fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), f = z.fwd || 0, sd = z.side || 0;
    const cx = d.position.x + fx * f + fz * sd, cz = d.position.z + fz * f - fx * sd;
    if (z.kind === 'ring') return { x: cx, y: 0.6, z: cz, r };
    return { x: cx + fx * r * 0.55, y: 1.0, z: cz + fz * r * 0.55, r: r * 0.5 };
  }

  // ---------------------------------------------------------------- reactions
  _react(dt) {
    const d = this.d, R = this.react;
    R.t += dt;
    const k = clamp(R.t / Math.max(0.05, Math.min(R.clip.dur, 0.45)), 0, 1);
    const want = ease(k);
    const step = want - R.moved;
    R.moved = want;
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const x0 = d.position.x, z0 = d.position.z;
    if (R.travel) d.moveBy(fx * R.travel * step, fz * R.travel * step);
    if (R.side) d.moveBy(-fz * R.side * step, fx * R.side * step);
    d.groundVelSet((d.position.x - x0) / Math.max(dt, 1e-4), (d.position.z - z0) / Math.max(dt, 1e-4));
    if (R.kind === 'lock') {
      // held until the hero's push is decided (onLockEnd); a lock the hero never resolves times out
      if (R.t > this.T.lock.dur + 1.5) this._toFoot(0.2);
      return;
    }
    if (R.t >= R.clip.dur) {
      const guard = GUARD_KINDS.has(R.kind);
      // the deflect: his counter comes straight out of the beat (no footwork between)
      // (on a streak of guards the counter is his flurry: as many blows as the streak counts)
      if (R.kind === 'deflect' && R.flurry && this.startStreak()) return;
      if (R.kind === 'deflect' && this.aiEnabled && this.startAct(this.K.counterMove?.(d.phase) ?? 'riposte')) return;
      // (a reaction that left him open: the hero's punish window keeps its length whatever his pace,
      // TUNING.openingGap; without one, the breather between moves)
      this._toFoot(guard || R.kind === 'backstep' || R.kind === 'sidestep' ? 0.25 : this.open.has(R.kind) && this.T.openingGap ? this._gap(this.T.openingGap) : null);
      // a ward or a flinch: the guard is straight back up (a cut does not open him for the next one)
      if (guard || R.kind === 'flinch' || R.kind === 'backstep' || R.kind === 'sidestep') this.raiseT = 0;
      if (guard) this.wardK = 1; // (the ward's clip ends raised: his footwork carries it on)
    }
  }

  /**
   * A strike his guard turned (duelist._guardClash; `clip`: the ward that meets it: 'ward' on his
   * left, 'wardR', 'wardHigh'). Returns what he did with it:
   *   'armor'    in a windup (or a backstep): the blade turns it in passing, his own move goes on
   *   'ward'     he holds it (from footwork, a ward, or breaking off a recovery); each one in a row
   *              makes the next more likely to be a
   *   'deflect'  he beats the strike away: the hero's blade is thrown back and his counter follows.
   */
  onGuarded(heavy, clip = 'ward') {
    const d = this.d, C = this.counter, G = this.T.guard;
    const a = this.act;
    if (d.mode === 'act' && a && a.t < a.recoveryStart) return 'armor';
    if (d.mode === 'react' && !GUARD_KINDS.has(this.react?.kind)) return 'armor';
    if (d.mode !== 'foot' && d.mode !== 'act' && d.mode !== 'react') return 'armor';
    if (d.time - C.t > G.countWindow) C.n = 0;
    C.t = d.time;
    C.n++;
    this.wardT = G.wardLinger ?? 0.6;
    // a streak of guards (DEFENSE.foeStreak): from its `min` he may answer with his flurry, and
    // then the strike is beaten away for certain
    const FS = DEFENSE.foeStreak, k = fin(d.streak) - FS.min;
    const flurry = this.aiEnabled && k >= 0 && !!this.K.MOVES?.[this._streakMove()] && Math.random() < (FS.launch[Math.min(FS.launch.length - 1, k)] ?? 1);
    const p = flurry ? 1 : G.counterChance[Math.min(G.counterChance.length - 1, C.n - 1)] ?? 1;
    if (this.aiEnabled && Math.random() < p) {
      C.n = 0;
      if (this.startReact('deflect')) {
        this.react.flurry = flurry;
        return 'deflect';
      }
    }
    if (!this.startReact(this.C[clip] ? clip : 'ward')) return 'armor';
    if (heavy) this.react.travel *= 1.7; // a heavy strike drives him back
    return 'ward';
  }

  /** His flurry's move for this phase (the kit's `streakMove(phase)`, else 'streakFlurry'). */
  _streakMove() {
    return this.K.streakMove?.(this.d.phase) ?? 'streakFlurry';
  }

  /** His flurry, now: as many blows as his streak counts (DEFENSE.foeStreak.max at most; `count`
   *  pins it: the Lab, tests). False when he has none or cannot act. */
  startStreak(count = null) {
    const d = this.d, FS = DEFENSE.foeStreak;
    const n = clamp(Math.round(fin(count, fin(d.streak))), 1, FS.max);
    return this.startAct(this._streakMove(), d.phase, { count: n });
  }

  /** A strike landed on him outside his guard: in footwork he flinches, and breaks off after a few. */
  onStruck(heavy) {
    const d = this.d, S = this.struck, F = this.T.flinch;
    // caught in his recovery: knocked out of it (a heavy blow staggers him)
    const a = this.act;
    if (d.mode === 'act' && a && !a.def.transition && a.t >= a.recoveryStart) {
      this.startReact(heavy ? 'stagger' : 'flinch');
      return;
    }
    if (d.mode !== 'foot' && !(d.mode === 'react' && (this.react?.kind === 'flinch' || GUARD_KINDS.has(this.react?.kind)))) return;
    if (d.time - S.t > F.window) S.n = 0;
    S.t = d.time;
    S.n++;
    if (S.n >= F.breakOff && this.aiEnabled) {
      S.n = 0;
      this.startReact('backstep');
      return;
    }
    this.startReact(heavy ? 'stagger' : 'flinch');
  }

  _broken() {
    const d = this.d;
    d.groundVelSet(0, 0);
    if (this.modeT >= this.T.posture.breakTime) {
      d.endBreak();
      this._toFoot(this.T.openingGap ? Math.max(0.4, this._gap(this.T.openingGap)) : 0.4);
    }
  }

  _dying(dt) {
    const d = this.d;
    d.groundVelSet(0, 0);
    const T = this.clip?.dur ?? 2.4;
    if (this.modeT > T * 0.6) {
      const k = clamp((this.modeT - T * 0.6) / 1.6, 0, 1);
      d.dissolve = k;
      const c = d._hs[1];
      d.fx.ashRise(c.x, c.y, c.z, 1 - k * 0.5, dt);
    }
    if (this.modeT > T * 0.6 + 1.7) d.finishDeath();
  }
}
