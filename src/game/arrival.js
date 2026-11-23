import { arrivalTuning } from './arrivalTuning.js';

// THE ARRIVAL (piece 'arrival'): as the player enters a level from the title, the camera opens wide
// over the arena for a few seconds while the level shows itself (a gust crosses it), then settles
// behind the hero. Any input skips it. Never on a respawn, never from the Lab's state jumps.
//
//   new Arrival(game, flow)
//   arrival.begin()          the title was dismissed (flow._startGame): once per page load
//   arrival.update(dt)       once a frame (real dt); returns true while the beat holds the camera
//   arrival.cancel()         a reset, a debug jump or the boss intro took over: it lets go at once
//   arrival.replay()         the Lab's 'arrival (replay)': the beat again, from explore
//   arrival.active           true from begin() until the camera has settled behind the hero
//   arrival.phase            'idle' | 'hold' | 'release'
// The skip is a CHANGE from the input at begin(): the stick pushed away from where it rested then (a
// drifting pad, or a stick already held off centre, does not end it), or a press of an action.
// With the piece off (`!game.world?.life?.on('arrival')`): begin() does nothing.
//
// It drives the flow's own eased override (flow._ov / _ovW / _ovZ / _ovLambda; main.js lerps the
// camera's focus toward _ov.focus by its weight and pulls out by its zoom), so every move eases: in
// from the title's framing, a slow crane from the arena back toward the hero over the hold, out to the
// plain hero camera. Its clock is its own (real seconds while the state is explore), not stateTime.
// Numbers: arrivalTuning.js.

const SKIP_ACTIONS = ['attack', 'heavy', 'block', 'dodge', 'flask', 'lockOn', 'interact'];
/** how far the move stick must be pushed (and moved from its rest at begin()) to skip */
const SKIP_MOVE = 0.2;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export class Arrival {
  constructor(game, flow) {
    this.game = game;
    this.flow = flow;
    this.active = false;
    this.phase = 'idle';
    /** began once this page load (a respawn, a second begin(), never replays it) */
    this.used = false;
    /** s since begin() (its own clock) */
    this.t = 0;
    /** 'time' | 'input' | 'cancel': why the hold ended (the tests read it) */
    this.ended = null;
    this.T = null;
    this._fx = 0;
    this._fz = 0;
    this._frontIn = -1;
    this._ax0 = 0;
    this._ay0 = 0;
  }

  get on() {
    return !!this.game?.world?.life?.on?.('arrival');
  }

  /** The title was dismissed: open the shot. Once per page load; nothing with the piece off. */
  begin() {
    if (this.used || !this.on) return false;
    this.used = true;
    return this._open();
  }

  /** The Lab: the beat again (explore only). */
  replay() {
    if (this.game?.state !== 'explore' || !this.on) return false;
    this.used = true;
    return this._open();
  }

  _open() {
    const f = this.flow, ov = f?._ov;
    if (!ov?.focus) return false;
    const T = (this.T = arrivalTuning(this.game?.level?.id));
    this.active = true;
    this.phase = 'hold';
    this.ended = null;
    this.t = 0;
    // start the focus from where the camera looks now (the title's framing, or the hero), so nothing jumps
    const p = this.game?.player?.position;
    // (the override's weight eases up from where it is: with the title's framing still on, its focus is
    // kept; with none, the focus starts on the hero, where the camera looks)
    const on = num(ov.weight, 0) > 0.02;
    this._fx = on ? num(ov.focus.x, num(p?.x, 0)) : num(p?.x, 0);
    this._fz = on ? num(ov.focus.z, num(p?.z, 0)) : num(p?.z, 0);
    this._frontIn = T.front ? Math.max(0, num(T.front.delay, 0)) : -1;
    // the stick as it rests now: a skip is a CHANGE from it (a pad that drifts, or a stick already held
    // off centre, never ends the beat by itself)
    this._sampleAxis();
    this._apply(0);
    return true;
  }

  /** The shot this frame: weight / zoom / lambda into the flow's override, the focus eased along. */
  _apply(dt) {
    const f = this.flow, T = this.T, ov = f._ov;
    const M = this.game?.cameraRig?.mobile && T.mobile ? T.mobile : T;
    const u = smooth(this.t / Math.max(0.1, T.hold));
    const tx = T.look.x + (T.end.x - T.look.x) * u;
    const tz = T.look.z + (T.end.z - T.look.z) * u;
    const k = dt > 0 ? 1 - Math.exp(-T.inLambda * dt) : 0;
    this._fx += (tx - this._fx) * k;
    this._fz += (tz - this._fz) * k;
    ov.focus.set(this._fx, 0, this._fz);
    f._ovW = num(M.weight, T.weight);
    f._ovZ = num(M.zoom, T.zoom);
    f._ovLambda = T.inLambda;
  }

  /** Let go: the camera eases back behind the hero (the flow's override decays at `lambda`). */
  _release(lambda, why) {
    const f = this.flow;
    this.phase = 'release';
    this.ended = why;
    f._ovW = 0;
    f._ovZ = 0;
    f._ovLambda = lambda;
  }

  /** The move stick now, as the rest the skip compares against. */
  _sampleAxis() {
    this._ax0 = this._ay0 = 0;
    try {
      const m = this.game?.input?.moveAxis?.();
      this._ax0 = num(m?.x, 0);
      this._ay0 = num(m?.y, 0);
    } catch {
      /* no input: the rest is the centre */
    }
  }

  /** Did the player move, attack or dodge this frame? A move is the stick pushed away from where it
   *  rested at begin() (SKIP_MOVE); an attack or a dodge is a press (an edge: a held button is not one). */
  _input() {
    const inp = this.game?.input;
    if (!inp || inp.enabled === false || this.flow?.swallowInput) return false;
    try {
      const m = inp.moveAxis?.();
      if (m) {
        const x = num(m.x, 0), y = num(m.y, 0);
        if (Math.hypot(x, y) > SKIP_MOVE && Math.hypot(x - this._ax0, y - this._ay0) > SKIP_MOVE) return true;
      }
      for (const a of SKIP_ACTIONS) if (inp.actPressed?.(a)) return true;
    } catch {
      return false;
    }
    return false;
  }

  update(dt) {
    if (!this.active) return false;
    const g = this.game;
    // a pause holds the beat where it is (no clock, no input)
    if (g?.state === 'paused') return this.phase === 'hold';
    if (g?.state !== 'explore') {
      // the flow has moved on (a death, the intro) and set its own camera this frame: just let go
      this.active = false;
      this.phase = 'idle';
      this._frontIn = -1;
      return false;
    }
    const rdt = Math.min(0.1, Math.max(0, num(dt, 0)));
    if (this.phase === 'hold') {
      this.t += rdt;
      if (this._frontIn >= 0 && this.t >= this._frontIn) {
        this._frontIn = -1;
        this._front();
      }
      if (this._input()) {
        this._release(this.T.skipLambda, 'input');
      } else if (this.t >= this.T.hold) {
        this._release(this.T.outLambda, 'time');
      } else {
        this._apply(rdt);
        return true;
      }
    }
    // release: done once the flow's override has settled back to the hero
    this.t += rdt;
    if (num(this.flow?._ov?.weight, 0) < 0.02 || this.flow?._ovW > 0) {
      this.active = false;
      this.phase = 'idle';
    }
    return false;
  }

  /** The level shows itself: a gust front across the shot (the creatures are left alone). */
  _front() {
    const L = this.game?.world?.life, F = this.T?.front;
    if (!F || !L?.on?.('wind')) return;
    // (quiet: it moves the air, it does not alarm the birds on the tree line)
    const o = { strength: num(F.strength, 1) * num(L.k, 1), speed: F.speed, width: F.width, quiet: true };
    if (Number.isFinite(F.dirX) && Number.isFinite(F.dirZ)) {
      o.dirX = F.dirX;
      o.dirZ = F.dirZ;
    }
    if (typeof L._call === 'function') L._call('wind', 'front', o);
    else L.wind?.front?.(o);
  }

  /** A reset, a debug jump or the boss intro took over: let go at once (the caller sets its own camera). */
  cancel() {
    const was = this.active && this.phase === 'hold';
    this.active = false;
    this.phase = 'idle';
    this._frontIn = -1;
    if (was) {
      this.ended = 'cancel';
      const f = this.flow;
      if (f) {
        f._ovW = 0;
        f._ovZ = 0;
      }
    }
  }
}
