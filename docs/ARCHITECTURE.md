# SCBK v0.2.0 — Windows game design and limitations

## Gameplay fidelity

**Goal:** restore the feel of a stylized map-based destruction game before broadening map selection. The v0.1.0 version was a coarse destructible-box prototype. This iteration changes the actual data structures and cinematic timing.

### Rendering
- OSM footprints and approximate heights are rendered as polygonal buildings with procedural window/brick-like shaders, generated roofs and GPU-batched foliage.
- Unstruck buildings have **one** static polygonal surface/roof with a box collider. Upon first impact their footprint gets sampled into a bounded spatial grid of 2–4 columns/rows and 2–5 vertical cells, up to 80 cells. The remaining grid is rendered via one MultiMesh; damaged cells become rigid bodies.
- This intentionally approximates silhouettes after a hit; it is not precise structural fracture and has no interiors.
- Colliders for a damaged building are a coarse original bounding box, so a ray may strike a gap; cell damage calculations still require proximity to remaining sections.

### Terrain
- 49×49 collidable mesh; material vertex colors shade steep terrain.
- Public AWS Terrain Tiles / Terrarium, zoom 12, 30-ish metres horizontal resolution depending on latitude. The app downloads only the tiles covering the selected playable region, caches on disk and subtracts a center elevation.
- If the DEM request fails, the flat terrain fallback remains interactive. Terrain takes actual local heights for OSM building positions and for road ribbon vertices.
- Craters lower the physical/visual terrain grid; reset recreates the reference heightfield.
- No caves, water simulation or city-wide streaming yet.

### Weapons
- Bomb: local blast, crater, flash, shockwave and impulse.
- Bat: directional close-range impulse and swing model.
- Laser: mouse drawn path, delayed charge, sequential strikes and line marks.
- Meteor: falling projectile then large impact, camera shake and crater.
- Quake: multi-step earthquake strikes for ~3 seconds.
- Nuke: falling projectile, blinding flash, expanding rings, stylized mushroom cloud and slowed time.
- Simple synthesized sound plays per trigger. Procedural assets avoid third-party copyright issues.

### Performance safety
- Map requests: region <=1.6 km per side, 280 nearest buildings and 200 nearby roads.
- Dense regions are still **truncated**, not true streaming. Craters rebuild 49×49 mesh/collider.
- Active debris capped at 160, older sleeping debris retired as new pieces are needed.
- Physics collisions use simple boxes and collision mask 1, not debris-to-debris broadphase.
- No Android, not WebView, no backend services required for cached map use.

### Remaining work
- Visual manual Windows QA and tuning FPS/lighting after first post-merge preview release.
- Faithful split geometry / fractured facades, collision precision, authentic projectile path, scorch trails, sound mixing, score/undo snapshot history, terrain craters under roads, more location-specific architecture and UI localization.
- Interactive map selection from v0.1.0 remains supported unchanged.

## CI / Release
PR Godot parser/runtime/logic smoke tests; main Windows EXE export; artifacts (EXE, checksum, commit) generated once. Formal release will reuse the verified artifact. v0.1.0 is not edited or replaced.
