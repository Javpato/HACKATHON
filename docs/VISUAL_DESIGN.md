# StudyVillage visual design system

Owned by the presentation layer. Contracts in `protocol/`, `world/model.ts`,
`house/model.ts` and `session/` are NOT owned here and must not change.

## Hard constraints discovered in the code

- The stage canvas is **768 x 432 logical units** (`LIMITS.worldWidth/Height`).
  Pointer hit-testing and all game coordinates live in that space, so the
  backing store size cannot change.
- `PARCELS`, `WORLD_TREES`, `HOUSE_BOUNDS` and `furnitureRect()` define
  collision and layout. Art must be drawn to fit those footprints, never the
  reverse. Tree obstacles are 22x25 centred on each tree point.
- The page Content-Security-Policy is `default-src 'self'` with no `font-src`.
  **No webfonts, no CDN.** Typography must come from system stacks.

## Virtual pixel

One art pixel = **2 logical units**. Every environment edge snaps to an even
coordinate so the whole scene reads at one density instead of mixing crisp and
blurry edges. `ipx()` does the snapping; `fill()` snaps automatically.

## Light

A single light source from the **top-left**. Highlights on top and left faces,
core colour on front faces, shadow on bottom and right faces, plus a contact
shadow where an object meets the ground. No object may contradict this.

## Palette

Warm, saturated and cosy rather than pale and washed out. Each ramp runs dark
to light so values stay separable when desaturated.

- **Moss** `#24402f #2f5a3e #3f7a4f #58a05f #7cc077 #a6dc98` - grass, canopy.
- **Earth** `#5a4028 #7a5739 #9c7349 #c09a64 #e0c08a` - paths, wood, trunks.
- **Ember** `#8c3f2c #c25f3c #e8884f #f6b265 #ffd79a` - roofs, lamps, accents.
- **Tide** `#1f4a4e #2f6f73 #47989b #74c0bd` - glass, water, cool shadow.
- **Paper** `#1e3730 #3c5a4c #f2e7cd #fbf4e2 #fffdf5` - ink and surfaces.

`COLORS` keeps its original key names so existing imports keep working; the
values behind them were retuned.

## Motion

- Small interactions 120-160 ms, panels 180-240 ms, scene changes 260-360 ms.
- Easing: `cubic-bezier(.2,.8,.3,1)` for entrances, `cubic-bezier(.4,0,.2,1)`
  for exits. Transform and opacity only.
- The render loop runs at **60 FPS** (it was capped at 30).
- Walk cycles are driven by accumulated delta time per character, not by wall
  clock, so characters do not march in lockstep and never freeze mid-stride.
- Remote characters are **interpolated toward** their last network position.
  The local character is drawn at its exact position so input stays immediate.
  Neither changes authoritative movement.
- Everything decorative is disabled under `prefers-reduced-motion`.

## Typography

- Headings: system sans, heavy weight, tight negative tracking.
- Labels and data: `ui-monospace`, uppercase, wide tracking. The monospace
  carries the retro game feel that a webfont would otherwise provide.

## Interface

The world is the subject. The stage gets the width; controls sit around it as
compact, contextual furniture rather than a grid of equal cards. Buttons are
chamfered with a hard drop face that compresses on press, instead of soft
pill shapes. Navigation uses drawn glyphs, not emoji.

## What the overhaul changed

Presentation files only: `ui/art.ts`, `ui/style.css`, `world/draw.ts`,
`house/draw.ts`, and the view-construction parts of `ui/app.ts`. No protocol,
movement, collision, networking, persistence or media logic was touched, and
every exported draw signature kept its shape (the `dt` argument is optional).

- **Terrain caching.** Grass, paths, plaza and empty plots are painted once
  into an offscreen canvas keyed by which plots are occupied, then blitted.
  Detail in the ground layer is therefore free per frame.
- **Depth sorting.** Trees, houses, lamps and characters go into one list
  sorted by baseline, so a character correctly passes in front of or behind
  each object instead of always drawing on top.
- **Decorative props are never tall.** Props are not collision obstacles, so a
  character can stand inside one. A well was built at the plaza centre and
  removed: `WORLD_SPAWN` is 384,215, and it swallowed the character. The plaza
  is flat paving now. The same reasoning removed an interior pendant lamp,
  because furniture positions are user-controlled and any fixed fitting
  eventually overlaps a wall-mounted frame.
- **Scene fade.** The stage canvas is shared between the village and a house,
  so no CSS animation retriggers on that switch. A 300 ms canvas fade keyed by
  scene supplies the transition.
- **Gradient caching.** The vignette and the glow pools are rasterised once and
  blitted. Rebuilding them per frame cost a dropped frame about every twenty
  (p95 33.4 ms); after caching, p95 is 16.8 ms.
- **Icons.** Six navigation icons are drawn as rects on a 12x12 grid, replacing
  Unicode glyphs from unrelated blocks. They are outlines with negative space,
  because solid bodies with same-coloured interior detail read as blobs at
  16 px.

## Known gaps

- WebKitGTK rendering of the new CSS, in particular `clip-path` chamfers, has
  not been confirmed in the packaged desktop app.
- The interior still has a lot of open floor with the default six furniture
  items. More built-in fixtures would need either collision support from the
  model layer or placement restricted to the unwalkable margins.
