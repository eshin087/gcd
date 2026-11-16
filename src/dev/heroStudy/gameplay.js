import { installGameplayStudy } from './gameplayActor.js';
import { installTemporaryStorage } from './temporaryStorage.js';
import { IDLE_GESTURES } from './idles.js';

async function bootPreview() {
  // A failure to isolate storage aborts before the game is imported.
  installTemporaryStorage();
  await import('../../main.js');
  const started = performance.now();
  while (!window.__game) {
    if (performance.now() - started > 30000) throw new Error('The level could not start. Please reload.');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  const game = window.__game;
  const query = new URLSearchParams(location.search);
  const study = installGameplayStudy(game.player, query.get('hero') === 'current' ? 'current' : 'tempered');
  const panel = document.querySelector('#hero-preview');
  const status = document.querySelector('#preview-status');
  const title = document.querySelector('#hero-preview-name');
  const buttons = [...panel.querySelectorAll('[data-hero]')];
  const safe = document.querySelector('#preview-safe');
  const close = document.querySelector('#preview-close');
  let closeView = false;
  if (matchMedia('(max-width:700px), (max-height:480px)').matches) panel.open = false;
  // Keep the preview controls from also pressing movement / guard / menu actions.
  for (const type of ['keydown','keyup','pointerdown','pointerup','mousedown','mouseup','wheel']) {
    panel.addEventListener(type, event => event.stopPropagation());
  }
  panel.addEventListener('click', event => {
    game.audio.unlock?.();
    if (event.target instanceof HTMLButtonElement) event.target.blur();
  });
  const reflect = () => {
    title.textContent = study.variant === 'tempered' ? 'Tempered · v5' : 'Current hero';
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.hero === study.variant));
    const u = new URL(location.href);
    u.searchParams.set('hero', study.variant);
    history.replaceState(null, '', u);
  };
  for (const b of buttons) b.onclick = () => {
    study.select(b.dataset.hero); reflect();
    status.textContent = `${title.textContent} selected. Same fight, same controls.`;
  };
  const levels = document.querySelector('#preview-level');
  for (const L of game.levels) {
    const o = document.createElement('option'); o.value = L.id; o.textContent = L.name;
    levels.append(o);
  }
  levels.value = game.level.id;
  levels.onchange = () => game.pickLevel(levels.value);
  game.player.debug.god = true;
  safe.onclick = () => {
    game.player.debug.god = !game.player.debug.god;
    safe.setAttribute('aria-pressed', String(game.player.debug.god));
    safe.textContent = `Invulnerable · ${game.player.debug.god ? 'on' : 'off'}`;
  };
  close.onclick = () => {
    closeView = !closeView;
    game.cameraRig.targetDistance = closeView ? game.cameraRig.minDistance : game.cameraRig.defaultDistance;
    close.setAttribute('aria-pressed', String(closeView));
    close.textContent = closeView ? 'Game camera' : 'Closer camera';
  };
  document.querySelector('#preview-explore').onclick = () => {
    game.flow.debug.toState('explore');
    status.textContent = 'Explore, run, attack and dodge. Switch A / B at any time.';
  };
  document.querySelector('#preview-fight').onclick = () => {
    game.flow.debug.toState('boss');
    game.player.debug.teleport(game.dragon.position.x, game.dragon.position.z + 7);
    game.player.lockOn = true;
    game.cameraRig.snap(game.player.position);
    status.textContent = 'Boss fight. Invulnerability can be switched off above.';
  };
  const idle = document.querySelector('#preview-idle');
  IDLE_GESTURES.forEach((gesture, k) => {
    const option = document.createElement('option'); option.value = String(k); option.textContent = gesture.label;
    idle.append(option);
  });
  document.querySelector('#preview-idle-play').onclick = () => {
    // A deliberate audition resets to exploration; movement or an attack still
    // cancels through the normal animator. No special gameplay loop is added.
    game.flow.debug.toState('explore');
    game.player.lockOn = false;
    game.player.debug.fightStance = null;
    const k = Number(idle.value);
    Object.assign(game.player.anim.fidget, { k, last: k, t: 0, w: 0, cut: false, still: 0 });
    status.textContent = `${IDLE_GESTURES[k].label}. Explore reset for this audition; move or attack to interrupt.`;
  };
  reflect();
  status.textContent = 'Choose Explore / reset or Fight boss to begin.';
  window.__heroPreview = study;
  document.body.dataset.previewReady = 'true';
}

bootPreview().catch(error => {
  console.error(error);
  document.querySelector('#preview-status').textContent = `Preview unavailable: ${error.message}`;
});
