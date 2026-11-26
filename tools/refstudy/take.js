// take.js (served at /__scratch/take.js): film one perfect parry of the Ash Disciple's thrust at the
// game camera. The page is loaded frozen (nav.mjs); everything moves on __tick(1/60).
const post = async (cv, url) => {
  const b64 = cv.toDataURL('image/jpeg', 0.9).split(',')[1];
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  await fetch(url, { method: 'POST', body: bin });
};

export async function take(name, { streak = 6, attack = 'plumThrust', lead = 0.3, before = 30, after = 150, dist = 2, side = 1 } = {}) {
  const g = window.__game, d = g.dragon, p = g.player, T = (n) => window.__tick(1 / 60, n);
  g.flow.debug?.toState?.('boss');
  T(360);
  d.debug.setAI(false);
  p.debug.god = true;
  T(30);
  // the hero 2 m in front of him, both facing each other, the aim on him
  // side-on to the camera: he faces screen-right, the boss to his right, turned to him
  {
    const c = g.camera ?? g.cameraRig?.camera;
    if (c) { const fw = c.getWorldDirection(d.position.clone()); p.yaw = Math.atan2(fw.x, fw.z) - Math.PI / 2 * side; }
  }
  p.debug.teleport(d.position.x + Math.sin(p.yaw) * dist, d.position.z + Math.cos(p.yaw) * dist);
  d.yaw = Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z);
  p.debug.heal();
  // the pointer on him (main.js re-aims from the mouse every frame)
  const cam = g.camera ?? g.cameraRig?.camera;
  const v = d.position.clone();
  const aim = () => {
    g.mouseGround.set(d.position.x, 0, d.position.z);
    if (!cam) return;
    v.set(d.position.x, 0.9, d.position.z).project(cam);
    const el = g.renderer.domElement, w = el.clientWidth || 1280, h = el.clientHeight || 720;
    g.input.mouse.x = (v.x + 1) / 2 * w;
    g.input.mouse.y = (1 - v.y) / 2 * h;
  };
  const face = () => { p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z); };
  for (let i = 0; i < 40; i++) { aim(); face(); T(1); }
  const diag = { yaw: +p.yaw.toFixed(2), flow: g.flow.state, dist: +Math.hypot(d.position.x - p.position.x, d.position.z - p.position.z).toFixed(2), yawGap: +(((Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z) - p.yaw) % 6.283 + 9.425) % 6.283 - 3.1416).toFixed(2), pstate: p.state };
  p.streak = streak;
  p.streakT = 0;
  let flashT = null;
  const log = [];
  const f = () => { if (flashT === null) flashT = g.time; };
  const names = ['player:parry', 'player:flurry', 'player:flurryHit', 'player:flurryEnd', 'player:hurt'];
  const fs = names.map((n) => { const h = (e) => log.push([n, +g.time.toFixed(3), e?.damage ?? e?.perfect ?? '']); g.events.on(n, h); return [n, h]; });
  g.events.on('combat:flash', f);
  d.debug.trigger(attack);

  const cv = document.createElement('canvas');
  cv.width = 1280;
  cv.height = 720;
  const cx = cv.getContext('2d');
  const src = g.renderer.domElement;
  await fetch(`/__film/start?name=${encodeURIComponent(name)}&fps=60`, { method: 'POST' });
  let pressed = false, rel = -1, frames = 0, endAt = -1;
  const ox = p.position.x, oz = p.position.z;
  let far = 0;
  for (let i = 0; i < 900; i++) {
    aim();
    if (!pressed) face();
    if (flashT !== null && !pressed && g.time >= flashT + lead - 0.1) { pressed = true; g.input.setVirtual('Mouse1', true); rel = i + 1; endAt = i + 6 + after; }
    if (i === rel) g.input.setVirtual('Mouse1', false);
    T(1);
    far = Math.max(far, Math.hypot(p.position.x - ox, p.position.z - oz));
    // film from `before` frames ahead of the press to `after` after it
    const pressAt = flashT !== null ? Math.round((flashT + lead - 0.1 - g.time) * 60) : 99;
    if (pressed || pressAt <= before) {
      cx.drawImage(src, 0, 0, cv.width, cv.height);
      await post(cv, '/__film/frame');
      frames++;
    }
    if (endAt > 0 && i >= endAt) break;
  }
  const r = await (await fetch('/__film/end', { method: 'POST' })).text();
  g.events.off('combat:flash', f);
  for (const [n, h] of fs) g.events.off(n, h);
  return JSON.stringify({ diag, name, frames, far: far.toFixed(2), log, r });
}
