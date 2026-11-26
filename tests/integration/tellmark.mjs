// The tell mark in a fight sim (combat/tellMark.js, ADR-224): the REAL module on the suite's game,
// subscribed as src/main.js subscribes it. It only reads `combat:tell`, so it changes nothing in the
// fight (it draws nothing here: the drawing is this file's own check, below).
//   const TM = attachTellMark(game);  ...the fight...  tellMarkCheck(TM, 'duel', out, assert)
// Every boss suite's bot fight (scenario WIN) calls it: each blue / red / black windup of the boss (or
// of a paper copy) raises the mark, a white one or a hazard never does, and each mark is gone before
// the blow's timing cue (when the windup allows) and always before its impact.
// Run alone (`node tests/integration/tellmark.mjs .`): the drawing, every look, on a stub fire field.
// (the repo root is the suite's: process.argv[2])
import { pathToFileURL } from 'node:url';

const imp = (p) => import(pathToFileURL(`${process.argv[2]}/${p}`).href);
const TM = await imp('src/combat/tellMark.js');
const { TELL } = await imp('src/combat/rules.js');

export function attachTellMark(game) {
  const R = { tells: [], game };
  if (!game?.events?.on) return R;
  TM.setTellMarkLook(TM.TELL_MARK_DEFAULT);
  TM.tellMarkInit(game);
  // (subscribed after the module: its handler has run when this one reads the result)
  game.events.on('combat:tell', (e) => {
    const L = TM.TELL_MARK_LAST;
    const raised = L.raised !== R.last;
    R.last = L.raised;
    R.tells.push({ tell: e?.tell, attack: e?.attack, hazard: !!(e?.hazard || e?.bullet || e?.brood || e?.source !== 'dragon'), clone: !!e?.clone, impactIn: e?.impactIn, raised, end: raised ? L.end : NaN, look: raised ? L.look : '' });
  });
  R.last = TM.TELL_MARK_LAST.raised;
  return R;
}

/** Print the fight's marks and check them. `clones`: the suite's boss has paper copies (Wen Yao). */
export function tellMarkCheck(R, tag, out, assert, { clones = false } = {}) {
  if (!R) return;
  const T = R.tells, L = TM.TELL_MARK;
  const own = T.filter((t) => !t.hazard);
  const want = own.filter((t) => t.tell === TELL.BLUE || t.tell === TELL.RED || t.tell === TELL.BLACK);
  const by = {};
  for (const t of want) by[t.tell] = (by[t.tell] ?? 0) + 1;
  out(`     the tell mark: ${want.length} of ${own.length} boss windups marked (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}), ${T.length - own.length} hazard cues left unmarked`);
  assert(want.length > 0 && Object.keys(by).length >= 2, `${tag}: the fight's blue and red windups raise the tell mark (${JSON.stringify(by)})`);
  const missed = want.filter((t) => !t.raised);
  assert(missed.length === 0, `${tag}: every blue / red / black windup raises the mark (${missed.length} missed${missed.length ? ': ' + missed.slice(0, 3).map((t) => `${t.attack} ${t.tell}`).join(', ') : ''})`);
  const wrong = T.filter((t) => t.raised && (t.hazard || !(t.tell === TELL.BLUE || t.tell === TELL.RED || t.tell === TELL.BLACK)));
  assert(wrong.length === 0, `${tag}: no white windup and no hazard raises it (${wrong.length}${wrong.length ? ': ' + wrong.slice(0, 3).map((t) => `${t.attack} ${t.tell}`).join(', ') : ''})`);
  const late = want.filter((t) => t.raised && !(t.end < t.impactIn));
  assert(late.length === 0, `${tag}: every mark is gone before its blow lands (${late.length} not)`);
  const roomy = want.filter((t) => t.raised && t.impactIn - L.lead >= L.minShow);
  const overlap = roomy.filter((t) => t.end > t.impactIn - L.lead + 1e-9);
  assert(overlap.length === 0, `${tag}: with room for it, every mark is gone ${L.lead} s before the impact, before the blow's own cue (${roomy.length} checked, ${overlap.length} not)`);
  if (clones) {
    const c = want.filter((t) => t.clone);
    assert(c.length > 0 && c.every((t) => t.raised), `${tag}: a paper copy's blue / red blow raises its own mark (${c.length})`);
  }
}

// ---- run alone: the drawing of every look, on a stub fire field (no camera: the headless fallback)
const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (main) {
  let fails = 0;
  const out = (...a) => process.stdout.write(a.join(' ') + '\n');
  const assert = (c, m) => {
    if (!c) {
      fails++;
      out('FAIL', m);
    } else out('ok  ', m);
  };
  out('== tell mark: the drawing (combat/tellMark.js) ==');
  let blobs = 0, tints = 0, minY = Infinity;
  const fire = { spawn: (b) => (blobs++, (minY = Math.min(minY, b.y)), Number.isFinite(b.x + b.y + b.z + b.heat) ? 0 : -1), tint: () => tints++ };
  const head = { part: 'head', x: 0, y: 1.7, z: 0, r: 0.2 };
  const game = { fx: { fire }, dragon: { hurtSpheres: [head], position: { x: 0, y: 0, z: 0 } }, player: { position: { x: 3, y: 0, z: 0 } } };
  const ev = (tell, o = {}) => ({ source: 'dragon', attack: 't', tell, impactIn: 0.8, x: 0, z: 0, ...o });
  const counts = {};
  for (const look of TM.TELL_MARK_LOOKS) {
    TM.setTellMarkLook(look);
    for (const tell of [TELL.BLUE, TELL.RED, TELL.BLACK, TELL.NORMAL]) {
      TM.tellMarkClear();
      blobs = 0;
      TM.tellMarkRaise(game, ev(tell));
      TM.tellMarkUpdate(game, 1 / 60, 1 / 60);
      counts[`${look} ${tell}`] = blobs;
    }
  }
  out('     blobs a frame:', JSON.stringify(counts));
  for (const look of ['bang', 'chevron', 'diamond']) {
    assert(counts[`${look} blue`] > 0 && counts[`${look} red`] > counts[`${look} blue`], `${look}: a parry mark is drawn, a dodge mark is more (two) (${counts[`${look} blue`]} / ${counts[`${look} red`]})`);
    assert(counts[`${look} black`] === counts[`${look} red`], `${look}: a charged (black) blow is marked as a dodge`);
    assert(counts[`${look} normal`] === 0, `${look}: a white blow draws nothing`);
  }
  assert(counts['off red'] === 0 && counts['off blue'] === 0, "off: nothing is drawn");
  assert(minY >= TM.TELL_MARK.minY, `no cell below ${TM.TELL_MARK.minY} m (${minY.toFixed(2)})`);
  // hazards, bullets, the brood and the world's tells: never
  TM.setTellMarkLook('bang');
  const r0 = TM.TELL_MARK_LAST.raised;
  for (const o of [{ hazard: true }, { bullet: true }, { brood: true }, { source: 'world' }]) TM.tellMarkRaise(game, ev(TELL.RED, o));
  assert(TM.TELL_MARK_LAST.raised === r0, 'a hazard, a bullet, the brood and the world raise no mark');
  // the timing: up from the start, gone by its end, in game time
  TM.tellMarkClear();
  TM.tellMarkRaise(game, ev(TELL.RED, { impactIn: 1.0 }));
  const end = TM.TELL_MARK_LAST.end;
  let up = 0, t = 0, lastUp = 0;
  for (let i = 0; i < 90; i++) {
    blobs = 0;
    TM.tellMarkUpdate(game, 1 / 60, 1 / 60);
    t += 1 / 60;
    if (blobs > 0) {
      up++;
      lastUp = t;
    }
  }
  assert(Math.abs(end - (1.0 - TM.TELL_MARK.lead)) < 1e-9 && lastUp <= end + 1e-6 && up > 20, `a mark 1 s from its blow shows from its start to ${end.toFixed(2)} s, then nothing (last drawn ${lastUp.toFixed(3)} s, ${up} frames)`);
  // a short windup: shown, and gone before the impact
  for (const T of [0.05, 0.2, 0.35, 0.6]) {
    const e = TM.markEnd(T);
    assert(e > 0 && e < T, `a windup ${T} s long: the mark is up ${e.toFixed(3)} s, gone before the impact`);
  }
  // a stagger / a death / a reset drops it
  const evs = { h: {}, on(n, f) { (this.h[n] ??= []).push(f); }, emit(n, d) { for (const f of this.h[n] ?? []) f(d); } };
  const g2 = { ...game, events: evs };
  TM.tellMarkInit(g2);
  evs.emit('combat:tell', ev(TELL.BLUE));
  const alive = () => TM.tellMarks().some((m) => m.alive);
  const a1 = alive();
  evs.emit('dragon:stagger');
  assert(a1 && !alive(), 'combat:tell raises it, a stagger drops it');
  out(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
}
