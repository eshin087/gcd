# Hero gear

What the hero wears is data. `model.js` builds the skeleton and the body (neck, head, face, ears,
eyes, hair, the flask); everything else is an **item** in an **equipment slot**, and a **loadout**
says which item sits in which slot.

```js
import { buildHero } from '../model.js';
import { DEFAULT_LOADOUT } from './index.js';

buildHero(U);                                             // the hero's set (DEFAULT_LOADOUT)
buildHero(U, { ...DEFAULT_LOADOUT, offhand: null });      // the hero without his shield
buildHero(U, { ...DEFAULT_LOADOUT, chest: 'my.plate' });  // another chest piece
buildHero(U, {});                                         // the plain undersuit, no weapon
```

The hero has ONE outfit (the owner, 2026-11-17: the hooded swordsman of the sheet "GCD ABYSS, main
character concept"; every older outfit and every outfit switch was deleted). The two human bosses
are built by the same `buildHero` from their own items (`enemies/ashDisciple/gear.js`,
`enemies/starlessLord/gear.js`, registered into the same registry on import).

| File | What it holds |
| --- | --- |
| `index.js` | `SLOTS`, the `GEAR` registry, `registerItem`, `getItem`, `DEFAULT_LOADOUT` (the hero's set), `HERO_TINT` (his colours), `BASE_LOADOUT`, `resolveLoadout` |
| `abyss.js` | the hero's set: `abyss.hood`, `abyss.robe`, `abyss.arms`, `abyss.legs`, `abyss.skirt`, `abyss.cloak`, `abyss.sword`; `ABYSS_LOADOUT`, `ABYSS_TINT`, `ABYSS_SWORD_DIMS` (the sword's own numbers), `HOOD_RINGS` (the hood's planes; the top ring a sliver, so the halves meet in a point), `ABYSS_PANELS` (the skirt), `ABYSS_SHEETS` (the robe's back). Built from the concept sheet's measurements; its materials are the `ab*` entries of `HERO_INK` |
| `shield.js` | `offhand` items: `shield.kite` (the hero's), `SHIELD_SHAPES`, `SHIELD_OFF` |
| `base.js` | the undersuit: fallback items for `chest`, `arms`, `legs` |
| `hands.js` | `buildFreeHand(ctx)`: the free hand every `arms` item that draws hands calls |
| `../heroGeo.js` | the geometry builders every item is made of (`bladeGeometry(spec, tip, forte)`: a blade from a profile) |
| `../heroDims.js` | `DIM`, `BODY`, `REST`, `HAIR_CLUSTERS`, `HERO_LEGS`, `HERO_HEAD_SCALE`, `legDims` (the body's measurements) |

### His colours

His colours live in his own materials: the `ab*` entries of `HERO_INK` (`model.js`), marked
`ownOnly`, three colours (black cloth, the white / silver line, the lavender-white crystal) and a
muted skin. They are drawn only in the player's own bank of part ids, with his own line
(`docs/STYLE.md` "The hooded hero"; `docs/ARCHITECTURE.md` "The hero's own line"), and never write
the shared per-part tables the bosses read. A gear item for him uses those materials (`M.abRobe`,
`M.abBand`, ...); an `ownOnly` material is made the first time an item asks for it.

`HERO_TINT` (= `ABYSS_TINT`, empty today) is kept as the contract for a tint over them: `{ <HERO_INK
name>: { fill?, ink?, emissive?, spec?, rim?, sub?, inkGlow?, glowK? } }`, which
`tintHero(rig.materials, tint)` (`model.js`) writes on ONE rig's material instances; the Player
applies it to every rig it builds (`player.js`: the constructor and `setLoadout`). A tint never
touches the shared `U.*`, so a boss never gets the hero's colours.

## Slots

Built in this order. The body is never bare: a loadout that leaves `chest`, `arms` or `legs` empty
gets the `base.*` item for it. Any other slot may be empty.

| Slot | Covers | Hangs on | Default item |
| --- | --- | --- | --- |
| `head` | helmets, hoods, masks. Hair, face and neck are the body, not gear; an item with `hair: [...]` keeps only those pieces of the hair (`'cap'` and `HAIR_CLUSTERS` names), `hidesHair: true` none of it; `shadowsFace: true` puts the face and neck in the item's shadow (near-black, no eyes); `blankFace: true` keeps the face lit but leaves the eyes out (a featureless face); `face: '<material>'` draws the face in that material of `M`, `faceScale` sets its width (not 1: the jaw also tapers to a V), `neck: '<material>'` the neck's | `head` | `abyss.hood` (`hidesHair`, `blankFace`, `face: 'abSkin'`, `faceScale` 0.8, `neck: 'abPants'`; builds its own silver hair on `head`) |
| `chest` | the torso from the hips' top (1.09 m) to the collar: shell, shirt, belts, cowl, collar, emblem | `spine`, `chest` | `abyss.robe` |
| `shoulders` | shoulder armour: the pauldron on its own joint, and any lames riding on the upper arms | `pauldron`, `arms.R.upper`, `arms.L.upper` | none |
| `arms` | both arms from the shoulder joint to the hand: sleeves, deltoid caps, vambrace / bracer, gauntlet / glove (the hands), elbow and wrist points. The SWORD hand's fist (`gripFist`) hangs on the `sword` joint, the grip's own frame, so it closes round the grip in every pose; it belongs to this slot, not to `weapon` | `arms.{R,L}.{upper,fore}`, `arms.L.wrist` (the free hand), `sword` (the fist) | `abyss.arms` |
| `legs` | hips, thighs, shins, feet, and what is strapped to them: hip straps, knee straps, boots, greaves, knee guards | `pelvis`, `legs.{R,L}.{thigh,shin,foot}` | `abyss.legs` |
| `waist` | cloth hanging from the belt line: skirt panels, tassets | `pelvis` | `abyss.skirt` |
| `back` | cloaks and capes | `chest`, and `arms.{R,L}.upper` for sheets draped over an arm | `abyss.cloak` |
| `weapon` | the weapon in the right hand: blade, grip, guard, pommel, gem | `sword` | `abyss.sword` (one-handed, 0.92 m from the pommel to the point) |
| `offhand` | a shield on the free forearm (the fist on its handle is the item's own) | `arms.L.shield` (built only when an `offhand` item is worn: its Y is the forearm's line, +Z the way the shield faces, −X its top; the animator turns it about Y) | `shield.kite` |

`arms` and `legs` own the limb itself (there is no skin mesh under the sleeves or the pants), so an
item for those slots must draw the whole limb, hands and feet included. `chest` likewise owns the
torso surface.

## Adding an item

1. Write it (in a new file here, one file per set):

   ```js
   import { limb, sub } from '../heroGeo.js';

   export const MY_ITEMS = [{
     id: 'my.sleeves',          // unique, '<set>.<piece>'
     slot: 'arms',              // one of SLOTS
     name: 'Plain Sleeves',     // display name (UI, later)
     build({ arms, M, DIM, BODY, mesh }) {
       for (const s of ['R', 'L']) {
         mesh(arms[s].upper, sub(limb({ length: DIM.upperArm, r0: BODY.upperArm[0], r1: BODY.upperArm[1] }), 1), M.shirt);
         // ... forearm, hand
       }
     },
   }];
   ```

2. Register it: add its list to the `registerItem` loop in `index.js` (or call
   `registerItem(item)` yourself before the hero is built).
3. Put its id in a loadout. `buildHero` throws on an id that is not registered and on an item
   placed in a slot other than its own.

### `build(ctx)`

`ctx` holds

- the skeleton joints: `root, body, pelvis, spine, chest, head, arms.{R,L}.{upper,fore},
  legs.{R,L}.{thigh,shin,foot}, pauldron, sword`. Read-only: hang things on them, never move,
  rotate, scale or re-parent them (the animator owns their transforms).
- `M`: the hero materials (`createHeroMaterials` in `model.js`), by name.
- `DIM`, `BODY`, `REST`: bone lengths and joint offsets, girth, and the idle height of each joint
  (`h - REST.spine` turns a height above the ground into a `spine`-local y).
- `mesh(parent, geometry, material, x, y, z)` and `joint(parent, x, y, z)`: create a mesh / a
  joint of your own under `parent`. **Create everything through these two.** They tag what you
  add with `userData.slot`, which is how the rig knows what belongs to your slot.
- `slot`, `item`: the slot being built and the item itself (for an item's own data, like a
  weapon's `dims`).

Axes: the hero faces +Z, Y is up, his RIGHT is −X. Limb joints point down −Y: the upper arm runs
from `y = 0` to `−DIM.upperArm`, the forearm to `−DIM.foreArm` (the grip centre), the thigh to
`−DIM.thigh`, the shin to `−DIM.shin`; the foot joint is the ankle, `DIM.ankle` above the sole. The
weapon joint's origin is the grip centre, the blade runs along +Z with its flats facing ±Y.
The `head` joint is scaled by the rig's head scale (`buildHero(U, loadout, { headScale })`: the hero's
`HERO_HEAD_SCALE` 1.0; default `BODY.headScale` 1.08, the duelists'), so head gear is modelled at 1.0
and grows with it. `ctx.DIM` carries the rig's own legs (`thigh`, `shin`, `pivot`): build legs and
anything placed by height from it, not from the imported `DIM`.

`build` may return handles the animator and the player need:

| Handle | From | Shape |
| --- | --- | --- |
| `coat` | `waist` | array of panels `{ anchor, segs: [upper, lower], def, strips, len: [upper, lower], r0 }` (below) |
| `streamers` | any (a weapon's own: `weapon`) | array of `{ segs: [root, tip], len: [l0, l1], out, lag?, max?, w?, arm?, wrap?, inMax?, floor?, weapon? }` (below) |
| `offHand` | `arms` | `{ open, grip, fingers? }`: the free hand open, the same hand closed round the grip `DIM.offGrip` below the sword hand (on the `sword` joint), and (optional) the sword fingers (`swordFingers`). Hang `open` and `fingers` on `arms.L.wrist` in wrist space (the hero's animator turns that joint) and put all three in `keep`; the animator shows one of them (`twoHand` and the hand's distance from the grip, the pose's `hs`). Build it with `buildFreeHand(ctx)` (`hands.js`): it does all of that |
| `shield` | `offhand` | `{ half: [half width, half height], off, top, foot }` (m): the plate's size, how far it stands off the forearm's axis, how far it reaches above / below the forearm. The rig carries it as `rig.shield` (with `joint`: `arms.L.shield`); with it the hero's animator plays the sword-and-shield clips (`shieldPoses.js`: no hand joins the grip, the guard and the parry are the shield's) and the player draws a block's sparks, a parry's clash and a guard break on the plate |
| `gem` | `weapon` | an Object3D on the weapon whose world position is where the hilt glows (the crystal sword has no gem: its marker sits at the guard's heart) |
| `flask` | any | a mesh shown only while he drinks (the animator sets its `visible` and `scale`). The hero's (`abyss.arms`) hangs on the SWORD forearm, `arms.R.fore`: with a shield he drinks from the sword hand |
| `keep` | any | meshes of yours that must not be merged (see "Merging") |

Handles left out default to what an empty slot means: `coat: []`, `streamers: []`, a `gem` marker
on the weapon joint at `DIM.gem`, and the body's own flask in the left hand (every boss). `coat` and `streamers`
from several items are concatenated.

## What the look needs

- **Glyph materials only.** Every mesh uses a material from `M`. No plain shaded meshes (see
  `docs/STYLE.md`). A new material needs an entry in `HERO_INK` and a spec in
  `createHeroMaterials` (`model.js`); ink-line part ids are limited to `HERO_PARTS` (20, in
  `render/shaderLib.js`), and materials sharing a part id must share its ink settings. A material
  for the hero is `ownOnly` with an `own: { bold?, merge?, flat?, subShade?, glow?, haloOn?, line?,
  rimLine?, fillGain? }` block (`docs/STYLE.md` "The hooded hero": adding a part); the higher part id
  draws a shared edge (legs < robe < sleeves < cowl < hood < hair < shield < crystal).
- **Geometry attributes.** `position`, `normal` and `aGUV` (the glyph grid's coordinates, +y up
  the body so letters stand upright) are required; `aPart` (the ink-line sub-id) is added as 0 if
  missing. The builders in `heroGeo.js` and `render/glyphGeometry.js` set them. `sub(g, 1)` gives a
  piece the other sub-id, which draws an ink line where it meets a neighbour of the same material;
  `foldLines` draws creases.
- **Sculpted parts** come from `heroParts.js` through `partGeometry(key)`. That file is generated:
  a new sculpted part is added to `scripts/blender/hero_parts.py` and rebuilt with
  `npm run hero-parts` (Blender 4.2+, ADR-037). The script fits parts to `DIM / BODY / REST /
  HAIR_CLUSTERS`, which it imports from `model.js`. Today only the hair locks (`hair.*`) are left.

## Merging

After all items are built, static meshes that sit on the same joint, use the same material and
belong to the same slot are merged into one mesh (fewer draw calls). Body meshes merge only with
body meshes, and nothing merges across slots. So:

- do not keep a reference to a mesh you created and expect it to survive, unless you return it in
  `keep`;
- anything you animate or toggle goes on a joint of its own (`ctx.joint`) or in `keep`.

## What the animator assumes (`anim.js`)

The animator was written for the old Wanderer's set and is shared with the bosses. It reads the
rig every frame, so these hold for any item:

- **Skeleton.** Bone lengths and joint offsets come from `DIM`; gear cannot change them. The legs
  are the rig's own (`buildHero(U, loadout, { legs })`, `rig.bodyDims`): the hero stands on
  `HERO_LEGS` (thigh 0.385, shin 0.38), every duelist on `DIM`'s.
- **Body girth.** The blade's clearance from the legs (`BLADE_CLEAR`), the push of the legs on the
  coat (`LEG_R`) and the ground clamps are sized from `BODY` and `DIM`, not from the gear. Armour
  much thicker than the body will be clipped by the blade and the coat.
- **Shoulder armour** on the `pauldron` joint follows the right arm by a fixed share
  (`PAULDRON_FOLLOW`). The joint sits over the RIGHT shoulder only; there is no left one yet.
- **Coat panels** (`coat`). Each panel is `anchor` (a joint on the `pelvis`, yawed to `def.az`,
  local +Z outward) → `segs[0]` → `segs[1]` → `strips[k].joint`, exactly two segments.
  `def` needs `az`, `w: [top, join, hem]`, `len: [upper, lower]`, and may set `flare`, `skew`,
  `flap`, and its own idle stir `breeze` / `idleFlare` (else the tables'); `len` is the pair of
  spring lengths, `r0` the anchor's distance from the pelvis axis; each strip is
  `{ joint, len, rest, phase }`. The idle breeze has per-panel values for the first six panels
  (`BREEZE` / `IDLE_FLARE`); later ones get none unless they set their own. `ABYSS_PANELS` in
  `abyss.js` (built by its `buildSkirt`: `open` turns a front panel round its own curve so the two
  fronts part, `hem` cuts its points, `mat` picks its material) and the bosses' `LORD_PANELS` / the
  Ash Disciple's robe are worked examples. For the hero the panels are one garment (`anim.js`
  `CLOTH`): they share the garment's velocity, swing out no more than `panelOut` standing, are drawn
  in and drawn up short through a roll (`tuckShrink`: their segments' `scale.y` animates, so do not
  rely on it staying 1), kept outside the shield's plate and his legs, and laid flat in a fan on the
  ground while he lies (`LAY`, `_layCloth`).
- **Streamers** (`streamers`). Two-segment springs: `segs[0]` at the root, `segs[1]` at
  `−len[0]` below it; `out` is the resting outward flare; `lag` (default 1) scales how far the
  sheet trails the motion: 1 is a light ribbon that streams out level at a run, the robe's back uses
  0.45; `max` (default 2.6 rad) is how far a segment may swing from hanging, the robe's back uses 0.95;
  `inMax` ([root, tip] rad, + = toward the wearer) caps how far each segment may swing IN (a head
  ribbon or a scarf off the back that must not swing into him; negative = always at least that far
  out; not applied while he lies down); `wrap` is the radius the sheet curves round at its root
  (the tests model the sheet with it), and a sheet with `wrap` is a WRAPPING sheet of one garment
  (`anim.js` `CLOTH`: the garment's shared velocity, a curved swing from root to hem, a hem that
  streams on a run, drawn in through a roll; no boss's sheet sets it); `push` (rad/s) is how fast the
  grass pushes a lagging end back out (the robe's back: 30); `floor: true` keeps its ends over the grass while he rolls or
  falls (a head ribbon: the forward roll puts his crown at the grass; a lagging end is eased back
  out, never snapped). Any slot may return streamers.
  `weapon: true` marks a weapon's own streamer (a ribbon off the pommel): the tests count the
  cloak's sheets without it.
  The root may hang on any joint (the robe's back hangs on `chest`; a sheet may drape over an upper
  arm). Give `w` (the
  widths [root, seam, hem]) so the animator can keep the sheet off the blade (ADR-048: spheres along
  the steel), and `arm` (1 / 2 for a sheet on the right / left upper arm). The arms do not push the
  cloth: a cloak hangs over its wearer's arms (holding the sheets out round them made the figure
  wide from behind).
- **The arms.** `_arm` compresses the last of each arm's reach (ADR-044), so a hand target at
  full stretch is reached with the elbow still bent (~35° for a duelist; the hero's arms open
  further, ~20-30°, ADR-090): model sleeves and hands for a bent arm, and do not rely on a pose
  locking the elbow. Without a shield the heavy blows, the charge and the block are two-handed
  (ADR-071): the free hand spends time on the grip, so return `offHand` if the item draws hands.
  With a shield (`offhand`) they are swung in one hand and the free arm carries the shield; the
  animator pushes the fist out until the plate's outline clears the torso, the hood, the thighs and
  the grass (`SHIELD_CLEAR`), so a bulky chest or head item may need a wider margin there.
  The free hand turns on its wrist (`arms.L.wrist`: sword fingers, a point, a palm braced on the
  grass): hang the open hand and the sword fingers there, keep the forearm's own meshes on
  `arms.L.fore` (a flask or a bracer stays on the forearm), and keep the left wrist clear of a
  drape so the pale hand reads on its own.
- **The weapon.** The animator's ground clamp and blade-in-body checks (`steelTip`, `forte`,
  `drawnTip`), the hit segment in `combat.js` (`bladeBase`, `bladeTip`) and the sword FX in `fx.js`
  (`forte`, `drawnTip`) read the sword's numbers from `DIM`. The weapon item carries a copy of
  them in `dims` (`gripBack, guard, gem, forte, steelTip, drawnTip, bladeBase, bladeTip`) and
  builds its own geometry from it. The rig carries the worn weapon's numbers as `rig.weaponDims`
  (ADR-123): the hero's animator (ground clamp, blade clearance, cloth), the sword FX and the drawn
  contact read them, so a weapon of another length is drawn, clamped and lit at its own length; the
  hit segment stays `DIM`'s (gameplay), and duelists' animators use `DIM`'s. The hero's own sword is
  one-handed and short (`ABYSS_SWORD_DIMS`: drawn to 0.77 m from the grip's centre, the steel to
  0.87 m; 0.92 m from the pommel's tip to the point).
- **Empty slots.** `coat: []` and `streamers: []` are fine. Without a weapon the sword joint is
  still posed and attacks still hit (the hit segment is `DIM`'s); only the mesh is gone.

## The rig

`buildHero` returns the rig `anim.js` and `player.js` use, plus

- `rig.loadout`: slot → the id of the item built there, `null` for an empty slot (fallbacks show
  as their `base.*` id);
- `rig.slots`: slot → the Object3Ds that slot hung on the skeleton (top level only: each one's
  subtree is the slot's too, and every object in it has `userData.slot`);
- `rig.bodyDims`: the legs it stands on (`{ thigh, shin, pivot }`, `legDims(opts.legs)`);
- `rig.weaponDims`: the worn weapon's numbers (its `dims` over `DIM`'s);
- `rig.shield`: `{ joint, half, off, top, foot }` with an `offhand` item worn (the joint
  `arms.L.shield` exists only then), else `null`;
- `rig.offHand`: the `arms` item's `{ open, grip, fingers }`, else `null`.

`buildHero(U, loadout, opts)`: `opts.legs` (`{ thigh, shin }`, default `DIM`'s; the Player passes
`HERO_LEGS`), `opts.headScale` (default `BODY.headScale`; the Player passes `HERO_HEAD_SCALE`) and
`opts.own` (true: the materials write the player's own bank of part ids; only the Player sets it).

## Next steps (not built yet)

- **Cheaper swapping.** Runtime swapping exists: `player.equip(slot, id | null)` and
  `player.setLoadout(loadout)` (`player.js`) rebuild the WHOLE rig under the same root and recreate
  the animator, so the pose restarts from the ready stance (equip out of combat). A per-slot swap
  (remove `rig.slots[slot]`, dispose, build that one item, re-merge) that keeps the animator and
  only rebuilds its coat / strip / streamer spring state is not built.
- **Weapons of other sizes.** Done for the drawn blade (ADR-123): a weapon item's `dims` reach the
  rig as `rig.weaponDims`, and the hero's animator, FX and drawn contact read them. Still open: the
  hit segment stays `DIM`'s (gameplay), and every duelist's animator keeps `DIM`'s numbers.
- **Helmets.** `hidesHair: true` on a head item leaves all the hair out (the hood). Trimming
  only part of it under an open helm is not built.
- **Stats and inventory.** Items carry only `id`, `slot`, `name` and geometry today.
