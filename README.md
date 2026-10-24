# SCBK — World Smash for Windows

SCBK v0.2.0 development: **native Godot 4.5.1 Windows 3D destruction sandbox** based on freely selectable real-world places. Windows-only; there is **no Android build or Android source release**.

## What changed for v0.2.0

- Detailed procedural facades: generated walls, windows and roofing, with lit windows in night mode.
- Partial building fractures: buildings initially render as a single static geometry. On the first hit they switch to up to 80 static cells; only the cells actually struck become physical fragments. Remaining floors stay in place and are breakable by later attacks. Dynamic fragments can be struck again.
- More varied weapon behavior:
  - Bomb: localized explosion and terrain crater.
  - Bat: short-range directional impact with a visible swing.
  - Laser: click-drag a path through buildings; charged sequential strikes along the stroke.
  - Meteor: projectile falls from the sky, with a larger blast and crater.
  - Quake: repeated impacts and camera shake over several seconds.
  - Nuke: falling projectile, large stylized mushroom cloud, timed slow motion and huge blast.
- Local score, combos, style ranks D–SSS, camera shake, generated sound effects and day/night mode.
- Real terrain elevation: asynchronous AWS Terrain Tiles (Terrarium, Mapzen) decoder with tile caching. DEM drives collidable terrain height and helps place roads and buildings; temporary network failure retains flat ground.
- 3D roads and light procedural vegetation generated using GPU MultiMesh.
- Strict render/physics ceilings: maximum 280 loaded OSM buildings, ~160 tree instances and 160 simultaneously simulated debris bodies.

## Map workflow preserved

Select **OPEN WORLD MAP** to search a place, pan/zoom the world map, then click or draw a rectangle and press **BUILD SELECTED 3D REGION**. Limited to 50–1600 metres on each side to protect memory and public APIs. Initial Dong-A Seunghak campus preset, direct coordinates and synthetic offline training scene also remain available.

Initial map downloads need network access (OpenStreetMap tiles, Nominatim geocoding, Overpass building/road geometry, AWS Terrain Tiles elevation). These map/DEM downloads are locally cached when successful.

## Windows controls

| Action | Input |
| --- | --- |
| Attack / launch selected weapon | Left mouse |
| Laser swipe | Choose tool 3, left-drag across the scene, release |
| Orbit camera | Right mouse drag |
| Pan camera | Middle mouse drag |
| Zoom | Mouse wheel |
| Tools bomb/bat/laser/meteor/quake/nuke | Number keys 1–6 |
| Toggle night lights | N |
| World map search/selection | M |
| Undo last building group (not score) | Ctrl+Z |
| Reset buildings, debris and terrain | R |

## Accuracy and performance limitations

This remains a stylized **game preview**, not a photographic reconstruction of the real place. OpenStreetMap building footprints and available floor heights are approximate. DEM is bare-earth, low-resolution SRTM-based elevation (not surveyed building foundations), and isn't always available. Replacing a whole building mesh with cells approximates the remaining building silhouette; true structural engineering/collision simulation, full-fidelity cracks, buried foundations and animated reverse-reconstruction are **not** claimed. Roads may visually bridge fresh craters. The six effects are independently implemented and are not direct copies of the original SMASH game's proprietary code or artwork.

Windows CI will only compile and export a release executable after PR approval and merge. Real Windows gameplay/visual quality must be verified with the resulting officially published release, not inferred from headless tests. Keep v0.1.0 binaries unchanged.

Map data: © OpenStreetMap contributors (ODbL), AWS Terrain Tiles / Mapzen (see their attribution requirements). Third-party imagery is not bundled with the game. Please respect public API usage policies.

## Developer workflow

- PR: Godot headless import/parse, map projections, destructible-world/score regression, startup smoke test and source/data assertions.
- After user command **확인해** and successful checks: merge PR; Windows Build CI exports one Windows executable with checksum and commit SHA.
- Separate release stage publishes that *same* verified binary without re-compilation.
- No Android features or export preset in this scope.

This is an independently developed Godot implementation. No code was copied from Hong-Iron/SMASH repositories.
