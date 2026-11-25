// The loading screen's side in the modules (the screen itself is plain HTML at the top of index.html,
// on screen from the first paint, before this bundle has even downloaded). main.js reports its boot
// steps here; the screen turns its waiting animation into a real bar. Everything is guarded: with no
// loading screen in the page (the headless tests, an old index.html) nothing happens, no step waits,
// and nothing here may throw.

const TRAVEL_KEY = 'gcd.travel';

const loader = () => {
  try {
    return globalThis.__gcdLoad ?? null;
  } catch {
    return null;
  }
};

const mark = (name) => {
  try {
    globalThis.performance?.mark?.(`gcd:${name}`);
  } catch {
    /* no performance API */
  }
};

/** Wait for the screen to repaint (a frame, then a task), at most ~100 ms; at once when there is no
 *  loading screen or the tab is hidden (no frames come there). */
function repaint() {
  const L = loader();
  if (!L || L.gone || globalThis.document?.hidden || typeof globalThis.requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      globalThis.requestAnimationFrame(() => setTimeout(go, 0));
    } catch {
      go();
      return;
    }
    setTimeout(go, 100);
  });
}

/** Boot step `word` starts, with `frac` (0..1) of the boot done, and runs to `to`; the bar repaints
 *  before it runs. */
export function bootStep(word, frac, to = frac) {
  mark(word);
  try {
    loader()?.step?.(word, frac, to);
  } catch {
    /* the screen is optional */
  }
  return repaint();
}

/** The game is on screen: the loading screen fades out (and forgets where the sword was going). */
export function bootDone() {
  mark('ready');
  try {
    globalThis.sessionStorage?.removeItem?.(TRAVEL_KEY);
  } catch {
    /* no storage */
  }
  try {
    loader()?.done?.();
  } catch {
    /* the screen is optional */
  }
}

/** The boot failed: take the loading screen away at once so the error shows. */
export function bootFail() {
  try {
    loader()?.fail?.();
  } catch {
    /* the screen is optional */
  }
}

/** Before a reload into level `id` (the stage picker, the boss rush): the next page's loading screen
 *  says where the sword is taking him. */
export function travelNote(id, name = null) {
  try {
    globalThis.sessionStorage?.setItem?.(TRAVEL_KEY, JSON.stringify({ id: String(id ?? ''), name: name ?? null, at: Date.now() }));
  } catch {
    /* no storage: the next screen shows its usual lines */
  }
}

/** The web fonts' stylesheet (index.html loads it without holding back the first paint): resolves once
 *  it has loaded or failed, at most `ms` later, so the glyph atlas is drawn with the same fonts as
 *  before. At once when the page has no such link (an old index.html, the tests). */
export function fontSheetReady(ms = 3000) {
  let link = null;
  try {
    link = globalThis.document?.getElementById?.('gcd-fonts') ?? null;
  } catch {
    link = null;
  }
  if (!link || link.media !== 'print' || link.getAttribute?.('data-failed')) return Promise.resolve();
  return new Promise((resolve) => {
    let t = 0;
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    t = setTimeout(done, ms);
    try {
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
    } catch {
      done();
    }
  });
}
