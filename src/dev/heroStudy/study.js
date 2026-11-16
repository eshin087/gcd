import * as THREE from 'three';
import { createSharedUniforms } from '../../render/shaderLib.js';
import { createGlyphAtlas, loadFonts } from '../../render/glyphs.js';
import { Pipeline, markCaster } from '../../render/pipeline.js';
import { setHeroGlyphScale } from '../../entities/player/model.js';
import { createStudyActor } from './actor.js';
import { StudySequence, SEQUENCES } from './sequence.js';

const $ = (id) => document.getElementById(id);
const VIEWS = {
  three: { yaw: 35, pitch: 10, distance: 5.4 },
  reference: { yaw: 225, pitch: 14, distance: 4.6 },
  front: { yaw: 0, pitch: 8, distance: 5.4 },
  side: { yaw: -90, pitch: 8, distance: 5.4 },
  back: { yaw: 180, pitch: 10, distance: 5.4 },
  game: { yaw: 180, pitch: 58, distance: 36 },
};

class StudyView {
  constructor(id, candidate) {
    this.canvas = $(id);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x04070c, 1);
    this.U = createSharedUniforms();
    this.U.uGlyphAtlas.value = createGlyphAtlas(this.renderer).texture;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 220);
    this.pipeline = new Pipeline(this.renderer, this.scene, new THREE.Scene(), this.camera, this.U);
    this.pipeline.setShadowSize(512);
    this.actor = createStudyActor(this.U, candidate);
    this.scene.add(this.actor.rig.root);
    markCaster(this.actor.rig.root);
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.width = this.height = 0;
  }
  render(view, spin) {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w !== this.width || h !== this.height) {
      this.width = w; this.height = h;
      // One CSS pixel per render pixel, matching the game's normal desktop
      // preset. Both panes use the exact same cell size and exposure.
      this.pipeline.setSize(w, h, 1);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const yaw = (view.yaw + spin) * Math.PI / 180, pitch = view.pitch * Math.PI / 180;
    // Preserve framing in a narrow pane without clipping the sword in a cut.
    const dist = view.distance * (view === VIEWS.game ? 1 : Math.max(1, 1.22 / this.camera.aspect));
    const p = this.actor.pilot.position;
    this.target.set(p.x, 0.99, p.z);
    this.camera.position.set(p.x + Math.sin(yaw) * Math.cos(pitch) * dist, 0.99 + Math.sin(pitch) * dist, p.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.actor.present(pitch, yaw);
    const U = this.U, e = this.camera.matrixWorld.elements;
    U.uTime.value = this.actor.anim.time;
    U.uFocus.value.copy(p);
    U.uCamPos.value.copy(this.camera.position);
    U.uCamRight.value.set(e[0], e[1], e[2]);
    U.uCamUp.value.set(e[4], e[5], e[6]);
    U.uBladeUp.value.set(0, 1, 0).lerp(U.uCamUp.value, 0.55).normalize();
    U.uPlayerScreen.value.set(0.5, 0.5, dist, 0);
    setHeroGlyphScale(this.actor.rig.mats, dist);
    this.pipeline.updateShadowCamera(p);
    this.pipeline.render();
  }
}

async function boot() {
  await loadFonts();
  const views = [new StudyView('reference', false), new StudyView('candidate', true)];
  const sequence = new StudySequence(views.map((v) => v.actor));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = !reduced, speed = 1, view = 'three', orbit = false, spin = 0;
  let last = performance.now(), seekQueued = null, seekTarget = null;

  function syncControls() {
    $('play').textContent = playing ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label', playing ? 'Pause playback' : 'Play animation');
    $('sequence-description').textContent = sequence.sequence.description;
    for (const b of $('sequences').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.sequence === sequence.id));
  }
  for (const [id, s] of Object.entries(SEQUENCES)) {
    const b = document.createElement('button');
    b.dataset.sequence = id;
    b.innerHTML = `<span class="num">${String(Object.keys(SEQUENCES).indexOf(id) + 1).padStart(2, '0')}</span><span>${s.label}</span><span class="arrow">↗</span>`;
    b.addEventListener('click', () => { seekQueued = seekTarget = null; sequence.select(id); syncControls(); });
    $('sequences').appendChild(b);
  }
  $('play').addEventListener('click', () => { playing = !playing; syncControls(); });
  $('restart').addEventListener('click', () => { seekQueued = seekTarget = null; sequence.select(sequence.id); });
  $('step').addEventListener('click', () => { playing = false; sequence.tick(1 / 60); syncControls(); });
  $('speed').addEventListener('change', (e) => { speed = Number(e.target.value); });
  // Coalesce rapid slider events to one deterministic seek per browser frame.
  $('scrub').addEventListener('input', (e) => {
    playing = false; seekQueued = Number(e.target.value) / 1000 * sequence.sequence.duration;
    syncControls();
  });
  for (const b of $('views').querySelectorAll('button')) b.addEventListener('click', () => {
    view = b.dataset.view; spin = 0;
    for (const v of $('views').querySelectorAll('button')) v.setAttribute('aria-pressed', String(v === b));
    $('view-note').textContent = view === 'game'
      ? 'Game scale · 58° / 36 m · equal pixels per metre; intentionally small, as in play'
      : 'Close study · the game’s actual ASCII renderer · both figures shown at equal scale';
  });
  for (const b of $('display').querySelectorAll('button')) b.addEventListener('click', () => {
    const mode = b.dataset.display;
    document.querySelector('.viewport-grid').dataset.display = mode;
    $('reference-pane').hidden = mode === 'candidate';
    $('candidate-pane').hidden = mode === 'reference';
    for (const v of $('display').querySelectorAll('button')) v.setAttribute('aria-pressed', String(v === b));
  });
  $('orbit').addEventListener('click', () => {
    orbit = !orbit;
    $('orbit').setAttribute('aria-pressed', String(orbit));
    if (!orbit) spin = 0;
  });
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || /INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault(); playing = !playing; syncControls();
  });
  syncControls();
  if (innerWidth < 600) $('display').querySelector('[data-display="candidate"]').click();
  function draw(now) {
    const elapsed = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (seekQueued !== null) {
      seekTarget = Math.min(seekQueued, sequence.sequence.duration - 1 / 240);
      seekQueued = null;
      sequence.select(sequence.id);
    }
    if (seekTarget !== null) {
      // A long scrub replays the springs. Yield between small batches instead
      // of blocking the UI for a whole twenty-second sequence on a phone.
      const until = performance.now() + 7;
      while (sequence.time < seekTarget && performance.now() < until) {
        sequence.tick(Math.min(1 / 120, seekTarget - sequence.time));
      }
      if (sequence.time >= seekTarget - 1e-7) seekTarget = null;
    } else if (playing && !document.hidden) {
      // Small fixed upper bound keeps the existing springs stable at slow FPS.
      let dt = elapsed * speed;
      while (dt > 1e-8) { const h = Math.min(dt, 1 / 120); sequence.tick(h); dt -= h; }
    }
    if (orbit && playing && !document.hidden) spin = (spin + elapsed * speed * 24) % 360;
    for (const v of views) if (!v.canvas.parentElement.hidden) v.render(VIEWS[view], spin);
    $('clip-name').textContent = sequence.step.label;
    $('clock').textContent = `${sequence.time.toFixed(1).padStart(4, '0')} / ${sequence.sequence.duration.toFixed(1)}`;
    $('scrub').value = String(sequence.time / sequence.sequence.duration * 1000);
    requestAnimationFrame(draw);
  }
  // Read-only diagnostics and deterministic controls for screenshot verification.
  // This object exists only on the audition page, not on the game's entry point.
  window.__heroStudy = {
    views, sequence,
    pause() { playing = false; syncControls(); },
    select(id) { sequence.select(id); syncControls(); },
    seek(t) { playing = false; sequence.seek(t); syncControls(); },
    view(id) { $('views').querySelector(`[data-view="${id}"]`)?.click(); },
  };
  document.body.dataset.ready = 'true';
  requestAnimationFrame(draw);
}

boot().catch((err) => {
  console.error(err);
  $('error').hidden = false;
  $('error').textContent = `The character study could not start. ${err?.message ?? err}. Try a browser with WebGL2 enabled.`;
  $('clip-name').textContent = 'Preview unavailable';
});
