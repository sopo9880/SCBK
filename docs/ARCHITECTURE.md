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


## v0.2.1 — first Windows user-feedback fixes

### Live map request state (not a graphics problem)

The first scene is intentionally a synthetic, offline training block. The v0.2.0 startup code requested Dong-A campus through Overpass after displaying that block. If a player clicked Campus while the request was still in flight, `region_loader.gd` emitted `region_failed` even though no network failure had occurred. The UI additionally mislabeled the current training world as a map download failure.

The corrected loader distinguishes:
- cached map loaded (no network call)
- new request started / progress across at most three Overpass endpoints
- same request already in flight (reports progress rather than failure)
- new target selected (cancels old request, requests new area)
- explicit user cancellation (not a failure)
- actual timeout / HTTP / malformed JSON (per-endpoint diagnostic and Retry button)

A user cannot be promised real campus geometry if public map servers are unreachable. Never display the training block as actual Dong-A buildings. No undocumented/redistributed third-party geometry is bundled.

### HUD and visual focus

`scripts/game_ui_v021.gd` extends the v0.2.0 gameplay and replaces the large v0.1.0 settings overlay. It preserves world picker actions while introducing a small, collapsible world card, optional manual-coordinates expansion, persistent bottom toolbar, keyboard shortcuts, and upper-right score. Runtime controls are tested headlessly in `tests/test_ui_shell.gd`; visual acceptance still requires real Windows gameplay after a release.

The offline camera starts at 290m instead of 580m, and the demo ground size is 720m across rather than 2200m; scattering vegetation over vast empty stretches is avoided. Existing OSM map-bounds sizing is preserved. The procedural facade shader darkens glass and roofs and a batched cornice mesh lends modest extra architectural depth. These improvements do not claim photorealism or exact SMASH fidelity.

### Fracture and terrain physics

v0.2.0 left the original full-building box collider active after replacing the visible building with damaged grid sections. This gave an invisible blocking wall even when a visible piece was gone. v0.2.1 disables that original collider upon fracture and assigns colliders to the remaining intact cells only. On hit, each struck section's collider is disabled; Reset removes all section shapes and reactivates the original whole-building collision.

This increases the number of collision shapes during heavy destruction. The per-building subdivision is still bounded to 80 and global active physics fragments to 160, but real Windows performance profiling is required in dense map selections.

Terrain uses a grid; small craters that fell between vertices are expanded to at least 1.55 grid cells to guarantee visible deformation. Roads can still visually bridge craters and DEM may be unavailable.

### CI discipline

`tests/test_map_loading.gd` is an offline state/caching test. `tests/test_ui_shell.gd` instantiates the actual game scene in a headless Godot runtime. `tests/test_gameplay.gd` checks fragment collision shape transitions in addition to destruction/terrain/score. PR tests do not certify visuals or public network availability; they precede the Windows-only release build. Existing v0.2.0 release files are immutable and Android remains out of scope.
