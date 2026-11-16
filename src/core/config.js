// Central tuning knobs. Gameplay numbers for the player/dragon live in their own modules.

// `?nobatch` in the URL (read once): draw the hero and the wyrm mesh by mesh instead of through
// rigid batches (render/rigidBatch.js). An A/B switch for frame-rate and image checks.
const NO_BATCH = (() => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobatch');
  } catch {
    return false;
  }
})();
// `?noseen` in the URL (read once): do not print the hero through what covers him (render/pipeline.js,
// ADR-106). An A/B switch for frame-rate and image checks.
const NO_SEEN = (() => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('noseen');
  } catch {
    return false;
  }
})();

export const CONFIG = {
  seed: 1337,

  world: {
    arenaRadius: 30, // the clearing
    playerBound: 31, // player can't leave this circle
    dragonBound: 26, // dragon center stays inside this circle
    worldExtent: 160, // square size covered by grass/scorch/shadows
    bonfire: { x: 0, z: 25.5 },
    playerSpawn: { x: 0.6, z: 23.8 },
    dragonSleep: { x: 3, z: -10, yaw: 2.4 }, // curled up beside the bone pile, head toward the SW
    bossTriggerZ: 6, // crossing north of this line (or getting within wakeRadius) wakes the dragon
    wakeRadius: 13,
  },

  camera: {
    fov: 32,
    pitch: (58 * Math.PI) / 180,
    distance: 36,
    minDistance: 24,
    maxDistance: 54,
    followLambda: 5.5,
    near: 1,
    far: 220,
    // Phones (touch controls on and the short screen side ≤ mobileMaxSide CSS px): a much closer
    // camera so the hero reads and the wyrm fills the view. Pinch zooms between min and max.
    // Lock-on, boss framing and the title / intro shots may add at most mobileMaxExtraZoom on top.
    mobileDistance: 20,
    mobileMinDistance: 14,
    mobileMaxDistance: 34,
    mobileMaxExtraZoom: 3,
    mobileMaxSide: 600,
    // A window taller than it is wide (a phone held upright; ADR-097): the vertical field of view
    // opens until the view is as WIDE as a square window's (cameraRig.js fovFor), portraitMaxFov at
    // most. A phone held upright also stands portraitDistance x further back and looks portraitLead
    // m south of the hero, so he stands above the middle of the screen, clear of the thumbs.
    portraitMaxFov: 68,
    portraitDistance: 1.2,
    portraitLead: 1.5,
    // The letters follow the zoom (?zoomArt=a|b|c; render/pipeline.js, wyrmGlyphs.js zoomArtStep):
    // past the default distance the art cell (the wyrm, prop art, the fire field) and the screen grid
    // (trees, the bonfire) step down the font ladder so an object keeps about the letters it has at
    // the default distance. `strength` per option: 0 = today's fixed letters, 1 = the letters
    // shrink as the picture does, 0.5 = half of that (log). `hyst`: how far (log of the cell height)
    // past the midpoint between two steps the wanted size must go before the font steps (a wheel
    // notch or the fight's breathing camera must not flicker it). `minPitch`: the camera must look
    // down at least this steeply (sine) for its distance to count (a Lab shot along the ground does
    // not). Desktop only: a phone (cameraRig.mobile) keeps its letters.
    zoomArt: { strength: { a: 0, b: 1, c: 0.5 }, hyst: 0.1, minPitch: 0.35 },
  },

  // Touch controls (src/ui/touch.js). Sizes in CSS px.
  touch: {
    stickRadius: 52, // knob travel
    deadZone: 0.16, // fraction of stickRadius ignored
    runAt: 0.62, // deflection that reaches full run speed (analog below)
    sprintAt: 0.94, // stick pushed to the rim = sprint (Shift)
    autoAimRange: 32, // m: in a fight, attacks / facing auto-aim at the dragon within this range
    aimDistance: 6, // m ahead of the hero along the stick when there is nothing to auto-aim at
    // The right-thumb cluster (ADR-096): ATTACK, BLOCK and DODGE are three tiles that all touch one
    // another, so the thumb goes from any one to any other without crossing a gap or a third tile.
    //   tiles  each tile in the cluster's own box: x from its right edge, y up from its bottom edge
    //   flask  the flask button rides with the cluster (same box), a gap away from the tiles
    //   reach  a touch this far outside the cluster still goes to the nearest tile
    //   slide  a thumb that slides from one tile onto another releases the first and presses the
    //          second without lifting; `stick`: how far it must leave its tile before that happens
    //   pos    where the cluster's bottom-right corner sits, [in from the right edge, up from the
    //          bottom]; the player picks one in the pause menu (PAD POSITION), as its size (PAD SIZE)
    //   tall   screens taller than 560 px (tablets): everything this much larger
    // (ADR-115, the owner's pick: a 2 x 2 square, BLOCK | HEAVY over DODGE | ATTACK; every tile
    // touches the two beside it and the slide works between them)
    pad: {
      tiles: {
        attack: { x: 0, y: 0, w: 92, h: 84 },
        heavy: { x: 0, y: 84, w: 92, h: 66 },
        dodge: { x: 92, y: 0, w: 80, h: 84 },
        block: { x: 92, y: 84, w: 80, h: 66 },
      },
      flask: { x: 106, y: 158, w: 58, h: 42 },
      reach: 26,
      slide: true,
      stick: 10,
      pos: { low: [26, 26], mid: [48, 52], high: [56, 84] },
      // the same three places on a screen held upright (thumbs come up from the bottom corners)
      posPortrait: { low: [12, 44], mid: [14, 104], high: [14, 170] },
      size: { s: 0.88, m: 1, l: 1.14 },
      tall: 1.14,
    },
  },

  // Gamepad (src/ui/gamepad.js; the Gamepad API "standard" layout). Stick values are 0..1 deflection.
  gamepad: {
    deadZone: 0.2, // radial dead zone of the left (move) stick
    runAt: 0.9, // deflection that reaches full run speed (analog below)
    aimDeadZone: 0.35, // the right stick steers the aim past this deflection
    triggerOn: 0.5, // an analog trigger (LT / RT) presses at this pull ...
    triggerOff: 0.3, // ... and releases below this one
    autoAimRange: 32, // m: with the right stick idle, attacks / facing auto-aim at the boss within this range
    aimDistance: 6, // m ahead of the hero along the aim direction when there is nothing to auto-aim at
    menuRepeat: 0.22, // s between repeated menu steps while the D-pad / stick is held
    // rumble per event: [duration ms, strong 0..1, weak 0..1] (dual-rumble; silently off where unsupported)
    rumble: {
      hurt: [180, 0.85, 0.5],
      guardBreak: [260, 1, 0.6],
      block: [70, 0.25, 0.35],
      parry: [90, 0.35, 0.8],
      perfectParry: [160, 0.7, 1],
      perfectDodge: [110, 0.15, 0.6],
      hitHeavy: [90, 0.45, 0.25],
      hitLight: [40, 0, 0.3], // every landed light cut: a short weak buzz
    },
  },

  render: {
    maxPixelRatio: 2,
    shadowSize: 2048, // default moon shadow map size (texels); the quality presets set their own
    shadowExtent: 80, // half-size in meters of the moon's orthographic shadow frustum
    batch: !NO_BATCH, // rigid batching of the hero and the wyrm (false with ?nobatch)
    // The hero printed through whatever covers him on screen (pipeline.js, ADR-106; `on` false with
    // ?noseen). `reach`: half-size (m) of the box round him that is drawn a second time (his figure
    // and his sword's reach). `margin`: how far (m) in front of him a thing must stand to count as
    // cover (what touches him, a blade that crosses his body, does not). `bareMargin`: the same for
    // untagged pixels (alpha 0: the grass at his feet must never count). The pass only runs while a
    // probe finds something in front of his torso (`probe`: the slab it tests, [half-width, from,
    // to] in m above his feet) and for `hold` frames after it last did.
    seenThrough: { on: !NO_SEEN, reach: 2.8, margin: 0.6, bareMargin: 1.5, probe: [0.4, 0.6, 1.9], hold: 20 },
    exposure: 1.55,
    bloomStrength: 0.85,
    bloomThreshold: 0.55,
    // through a freeze-frame (game.hitstop) particles and lights run on at this share of real time:
    // the fighters hold the impact's pose while its sparks fly (game.fxDt)
    fxLive: 0.6,
  },

  // Quality presets (cycle with F2). grass = blade instances drawn, shadow = moon shadow map size.
  quality: [
    { name: 'LOW', grass: 90000, dpr: 1, shadow: 1024 },
    { name: 'MEDIUM', grass: 170000, dpr: 1.25, shadow: 2048 },
    { name: 'HIGH', grass: 260000, dpr: 2, shadow: 2048 },
  ],
  defaultQuality: 2,
  defaultQualityTouch: 0, // touch devices start on LOW (phones with DPR 3 + 260k blades crawl)
};
