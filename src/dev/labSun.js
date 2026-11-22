import { el, button, setText } from './labDom.js';
import { hasReward, grantReward, takeReward } from '../game/rewards.js';

// The Lab's SUN section (the Skywell Vault only; ADR-132 / ADR-133): the four lids shut by hand, all
// opened again, a well bored at the hero, his light set full or empty, held radiant or dim, an eclipse
// now; a readout of his light, whether he stands lit, the lids open. And the level's fixed reward
// (ADR-134): grant or take away Falling Heaven. Returns the readout's sync (the Lab's refresh calls it).

export function buildSun(lab, root) {
  const game = lab.game;
  if (!game.world?.sun && typeof game.dragon?.debug?.sunForce !== 'function') return null;
  const { body } = lab._section(root, 'sun', 'SUN');
  const sun = () => game.world?.sun ?? null, d = () => game.dragon;
  const ok = (t) => lab._status(t, 'ok');
  const grid = el('div', 'lab-grid', null, body);
  for (let i = 0; i < 4; i++) {
    button(grid, `Shut ${['NE', 'NW', 'SE', 'SW'][i]}`, () => ok(sun()?.shut(i) ? `lid ${i} shut` : 'no lid')).title = 'break the windlass that holds this lid open';
  }
  button(grid, 'Open all', () => {
    sun()?.openAll();
    ok('every lid open (the world restored)');
  }).title = 'world.restore(): the windlasses stand again';
  button(grid, 'Bore here', () => {
    const p = game.player?.position;
    ok(p && sun()?.bore(p.x, p.z, 2.8, 12) ? 'a well bored over the hero' : 'no free well');
  });
  button(grid, 'Light full', () => ok(`light ${d()?.debug?.setSun?.(1)}`));
  button(grid, 'Light empty', () => ok(`light ${d()?.debug?.setSun?.(0)}`));
  button(grid, 'Lock radiant', () => ok(`held at ${d()?.debug?.sunForce?.(1)}`)).title = 'as if he stood in a pool (an eclipse still puts it out)';
  button(grid, 'Lock dim', () => ok(`held at ${d()?.debug?.sunForce?.(0)}`));
  button(grid, 'Unlock', () => {
    d()?.debug?.sunForce?.(null);
    ok('his light is the wells\' again');
  });
  button(grid, 'Eclipse now', () => ok(d()?.debug?.eclipse?.() ? 'eclipsed' : 'not now'));
  const R = game.level?.reward;
  let rb = null;
  if (R?.id) {
    rb = button(grid, '', () => {
      if (hasReward(R.id)) takeReward(R.id);
      else grantReward(R.id);
      sync();
      ok(`${R.name}: ${hasReward(R.id) ? 'held' : 'taken away'}`);
    });
    rb.title = `the level's reward (${R.name}): a sprint, then heavy`;
  }
  const info = el('div', 'lab-note', '', body);
  const sync = () => {
    const S = d()?.sun, W = sun();
    if (rb) setText(rb, `${R.name}: ${hasReward(R.id) ? 'on' : 'off'}`);
    if (!S) return;
    setText(info, `light ${S.k.toFixed(2)}${S.eclipsed ? ` · ECLIPSED ${S.eclipseT.toFixed(1)} s` : ''}${S.forced != null ? ` · held ${S.forced}` : ''} · ${S.lit ? 'in a pool' : 'in the dark'} · lids open ${W ? W.openCount : '-'} / 4 · wells bored ${W ? W.boredCount : '-'}`);
  };
  sync();
  return sync;
}
