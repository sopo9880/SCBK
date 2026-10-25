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

## v0.2.2 — projection, ground hit and blast pipeline

### Rendering real geographic identity

The selected 3D region remains based on real OpenStreetMap way geometries from `region_loader.gd`. `ground_map_projection.gd` converts the original road/building footprint coordinates into a bounded 512x512 terrain image, aligned to the mesh extents including 80m DEM margins using planar UVs. `terrain_surface.gd` multiplies this texture by the existing slope tint and extra crater scorch. Regenerating the collidable terrain after a crater retains the texture.

If a user already interacted with the Godot 2D world-map picker, its `user://map_tiles/z/x/y.png` entries may instead cover the selected region: the ground-map projector reuses the **complete** set of at most 16 already cached OSM raster tiles without issuing a single network request. When raster coverage is incomplete it falls back to generated OSM vector imagery. This is not satellite imagery. The game does not bulk-prefetch raster imagery, and OpenStreetMap attribution remains visible while in game. Keeping tile requests tied to direct 2D map browsing and caching is necessary under the OSMF tile usage policy (https://operations.osmfoundation.org/policies/tiles/). User-selected images from arbitrary satellite providers are intentionally not fetched.

A bounded number of proper building names from the real OSM response receive 3D label markers; no made-up campus names are generated.

### Ground ray and weapon rules

`gameplay_v022.gd` extends the v0.2.1 UI/gameplay, overriding target selection. The usual Godot physics ray detects terrain, buildings and debris. For non-bat weapons a fallback intersects the camera ray against the deformable height surface (3 iterations), rejecting hits outside the current terrain extents. Bomb, meteor, quake and nuke impacts snap to actual terrain elevation even after a building is hit. The bat requires `scbk_building` metadata and does not affect ground. Lasers keep their original drag/strike path.

Weapon 6 offers a 40–360m blast radius with presets and a ground-following ring rebuilt only when aim/radius changes. The configured radius is propagated to `combat_effects.gd` and governs the staged nuclear pressure, full damage footprint, central crater, particles and camera shake. Death/score/debris caps are still governed by `WorldBuilder`.

### Debris and terrain lifecycle

`destructible_building.gd` uses a shared chipped mesh for dynamic rubble, keeping a compact box collision per physical fragment. Only surviving building cells remain static collision bodies after a fracture; up to three unsupported upper cells may also fall when the supporting floor is destroyed within the local blast/physics budget. The original whole-building collider returns on Reset. No true fracture-network or finite-element engineering simulation is claimed.

`terrain_surface.gd` uses a 49x49 height and concave collider grid with excavation, raised rim and scorch. Up to 96 crater events are retained so a delayed external DEM update can reapply existing damage instead of silently flattening it. Reset clears both topography damage and the visual scorch mask. Geometry is still coarse for very small craters; roads can bridge fresh craters.

`tests/test_projection_v022.gd` and `tests/test_weapon_v022.gd` validate the offline cartographic raster, ground ray, nuke slider binding, BAT restrictions, crater/reset, and delayed DEM damage persistence. The existing gameplay test also verifies irregular physical rubble. The next CI phase uses headless Godot tests only; real Windows visual acceptability remains a separate post-release user test.

## v0.2.3 — standalone cinematic weapon pipeline and truthful progress

### 8km nuclear blast and physics limits

The nuclear weapon remains weapon index 5, preserving all existing controls, and `gameplay_v023.gd` adds a dedicated **8km** action alongside the regular 40–360m slider. `combat_effects.gd` computes a real 8000m radius and emits six outward radial pulses with a world-space warning, flash, smoke and shockwaves. `gameplay_v023.gd` moves the camera back temporarily, expands its far plane to 20km and restores the user's original orbit after the effect.

The old `strike_radius` mechanic could hit only a handful of buildings when the 160-fragment budget filled. The new `world_builder.gd::massive_blast` uses **seven nearest physical building hits** at most, then `destructible_building.gd::collapse_lightweight` disables the geometry and collision of all remaining **loaded mapped** buildings inside the expanding blast. This is reversible on Undo and Reset, counts as destroyed for scoring and preserves the global 160-body limit.

**Scope:** The existing region loader limits one selection to at most 1.6km per side. The 8km nuclear weapon is *not a new 16km terrain/OSM importer*. Its damage ring correctly reaches 8km in the game coordinate system, but terrain and mapped building effects only apply to the currently loaded playable location. No unrequested OSM bulk data collection, fake off-map buildings or full-city physics are implied.

### Earthquake intensity and weapon handling

`combat_effects.gd` provides `set_quake_magnitude(4.0..10.0)`. Quake input produces about 3 seconds of pressure pulses with scaled shake, amplitude and simulated epicentral radius. `world_builder.gd::quake_pulse` applies fragment-limited localized stress; at high magnitude some unsupported, high-damage structures can collapse by a cheap visual/physics-disable operation without generating massive extra debris.

The bat size is adjustable from 0.5x to 3.0x. Its visual model, impact radius and force all scale together. Bombs and meteors use stronger local impulses and slightly larger terrain excavations. Meteor/nuke sequences emit action start/finish for cinematic camera orbit recovery.

### Laser line and persistent scar

The 2D drag stroke is ray-cast onto the 3D surface and interpolated into at most 96 world-space points. The weapon charges then sweeps a three-layer cyan/white cylinder along each segment, producing bounded impact pulses instead of a single circle. The full path is also sent through the `laser_ground_cut` signal; `terrain_surface.gd::laser_cut` computes closest distance from every terrain mesh vertex to the entire path, excavates and scorches, then rebuilds visual and concave collision meshes exactly once. It records the stroke in the existing capped crater history for DEM replay and Reset. Continuous high-precision geometry is limited by the retained 49x49 terrain grid and physics budget.

### Map loading progress semantics

`region_loader.gd::load_stage(percent,description,indeterminate)` distinguishes honest unknown network wait time from completed parsing/data-processing work. During HTTP requests the progress bar animates as **indeterminate**, without showing fabricated percentages; it becomes a determinate count when downloaded data is parsed into OSM elements. `world_builder.gd::world_build_progress(phase, progress)` reports construction counters and transitions into road/vegetation finalization. The HUD reacts to cancellation, cache hits, failure, and completion, while the earlier Retry/Cancel controls and cached file structure are preserved.

Future true smooth per-frame building construction would require asynchronous world transactions and explicit cancellation tokens; the current synchronous assembly provides truthful counters but can still occupy a frame on a dense region.

### Regression / shipping

PR checks add `tests/test_cinematic_v023.gd` (giant nuke hit-count vs physics cap, Undo, M4–M10 and bat controls, map loading panel) and `tests/test_progress_laser_v023.gd` (cache progress, actual OSM-entry counting, continuous terrain scar, delayed DEM and Reset). Existing v0.2.2 and older regression suites stay in place. The project remains Windows-only, and a future official release must reuse the successful post-merge Windows EXE with verified provenance rather than compiling a second binary.
