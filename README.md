# SCBK — World Smash for Windows

SCBK v0.2.3 development: **native Godot 4.5.1 Windows 3D destruction sandbox** based on freely selectable real-world places. Windows-only; there is **no Android build or Android source release**.

## v0.2.3 — offline native cinematic weapons, 8km nuke, earthquakes and progress

This Windows-only Godot update focuses on the feel of a standalone physics/destruction game rather than the speed and restrictions of a browser scene. It remains an **original independent implementation** that does not bundle source code, graphics, audio or other copyrighted materials from the reference browser game.

### Major changes

- **Dedicated 8km nuclear preset:** Select weapon 6 then **8 km**. Regular fine adjustment stays at 40–360m. The 8km blast has a world-space radius of 8,000 metres, bigger camera far plane, cinematic pullback and staged fireball/pressure-ring propagation. Within the **currently loaded OSM region** every mapped building in the blast range can collapse; nearby ones receive detailed physical chunks, distant ones use lightweight graphical collapse rather than exhausting the 160-rigid-body cap. Reset or Undo restores the collapsed buildings.
- **Explicit 3D map coverage:** The 8km effect extends geographically beyond the visible region, but 3D map selection still loads up to ~1.6km per side. **Buildings outside the actual loaded region are not secretly generated or damaged.** The controls state this openly; the 8km mode provides spectacular impact on the loaded neighbourhood without asserting unrealistic full-city simulation.
- **Truthful map progress bar:** Top-centre panel appears for live map requests, cache hits and world generation. Network requests have an **animated indeterminate bar** and server number, never a made-up network percentage. After receiving data it switches to measurable stages (JSON parse, actual count of OSM elements processed, building creation, roads, vegetation, ready). On cancel/failure it disappears and preserves Retry/Cancel behavior.
- **Adjustable earthquake intensity:** Weapon 5 exposes magnitude **M4.0–M10.0** in 0.1 increments with 4/6/8/10 presets. About three seconds of pulses change shake, epicentral radius, damage, surface deformation and secondary collapse. High intensity is deliberately heavy on *loaded* structures but uses bounded physics.
- **Reference-inspired laser:** Weapon 3 traces a user-drawn world-space path (up to 96 points) after a visible charge; three concentric cyan/white beams sweep across it, repeatedly fracture nearby structures, and carve/scorch one continuous real terrain collision groove. A single mesh rebuild avoids a frame hitch per sample.
- **Weapon improvements:** Bomb and meteor base damage and craters are stronger; the bat gets a 0.5–3.0x size/strength slider with presets. Meteor and nuclear drops trigger an aerial camera pullback and restore the previous viewpoint when the action finishes.
- **Performance design:** no Android build; the number of *simulated* flying pieces is still capped at 160, visible small areas get high-fidelity destruction, and wide-area collapses reuse existing mapped buildings rather than spawning millions of fragments. Transient FX expire automatically. Existing cached regions, user data, controls and the v0.2.2 installed application identity are preserved.

### Updated controls

| Action | How |
| --- | --- |
| Choose nuclear blast | Weapon 6, 40–360m slider or **8 km** preset |
| Nuclear aiming | Move cursor for a ground-following radius ring; click ground/building |
| Earthquake magnitude | Weapon 5, M4.0–M10.0 slider or M4/M6/M8/M10 preset |
| Bat size | Weapon 2, 0.5–3.0x size slider and quick presets |
| Charged laser | Weapon 3, hold left click and draw across terrain/buildings, release |
| Map loading status | Top centre when fetching/assembling map; Cancel/Retry in map card |
| Reset collapsed buildings, rubble and terrain | R; existing undo remains Ctrl+Z |

**Preview notes:** The 8km blast is a game effect scale, **not a licensed nuclear weapons simulator** or an 8km satellite terrain download. Strong quake and laser effects are stylized approximations. Screenshots, frame rate, real map connectivity and actual input quality require post-release Windows testing. The EXE is not Authenticode signed, so Windows SmartScreen may warn. The release process must reuse the single original Windows CI-built EXE without rebuilding it.

## v0.2.2 — grounded world maps, ground strikes and scalable nuclear blasts

**This update follows real Windows v0.2.1 testing.** Real Dong-A campus OSM geometry and elevation loaded successfully, but the plain terrain did not communicate which place was being viewed, bombs were too geometric, and destructible building chunks were overly regular.

- **Live 3D terrain map projection:** selected OSM roads, footprints and terrain are drawn into a geographically aligned 512x512 land texture. The app may reuse **only OpenStreetMap map-picker tiles already cached through normal interactive viewing** for an accurate road/label image. It does not scrape/bulk-download or prefetch raster imagery when generating the 3D scene. An always-visible OSM attribution appears at the bottom left. Press **T** or click **지형 지도** to toggle the overlay. Actual OSM building names (if available) appear as a limited number of billboard markers.
- **Ground targeting:** bomb, laser, meteor, quake and nuke can now target terrain even when the mouse is not over a building. The bat is intentionally limited to buildings and fragments. The hit ray can fall back to heightmap intersection within the actual visible ground. Explosion centres are projected to ground level; crater geometry and collision match.
- **Real terrain damage:** a bowl-shaped crater with raised rim and scorching is written into the heightmap and collision surface. Impact effects also work with textured terrain. If high-resolution elevation data arrives after an explosion, the crater remains. Reset clears craters and scorch.
- **Custom nuke blast radius:** select weapon **6** to expose a slider (40–360 m), three quick presets (60/160/320 m), an actual ground-following target circle, and Shift+mouse wheel adjustments. The effective damage range, pressure-wave visuals, crater radius, dust and shake are tied to the selected radius.
- **Weapon differentiation:** bombs descend before detonation; meteor and nuclear strikes display impact warnings, pressure waves and bounded CPU particle dust/sparks. A nucleus-like stem and smoke lobes replace the single opaque nuke circle. Nuclear damage unfolds in multiple radial phases.
- **Improved fragmentation:** chunk meshes have chipped, irregular concrete surfaces rather than window-textured boxes. Unsupported upper pieces can fall after lower sections fail (budgeted to avoid mass physics growth), and surviving walls gain modest wear shading.
- **Tests:** offline 3D map raster projection, ground crater/late DEM/scorch/reset, bat-only restrictions and nuke slider-to-weapon synchronization are included in PR checks along with existing fracture tests.

### What this does not do

The 3D projection uses **OSM cartographic/vector mapping**, not satellite or photographic imagery. Third-party satellite photography cannot be bundled or downloaded without an appropriate license/API. OSM map data and the cached, previously viewed map tiles still depend on the user's available coverage. Physics and effects are stylized prototypes rather than engineering-accurate structural simulation; a 160 active-debris-body cap remains. Larger nuclear ranges can hit many buildings while physics limits constrain simultaneously simulated rubble. Profiling FPS, input hit accuracy and visual acceptance on Windows is still necessary after the official release.

### New controls

| Function | Key / interaction |
| --- | --- |
| Toggle projected cartographic ground | T / 지형 지도 |
| Bomb, meteor, quake or nuke | Ground or building left click |
| Bat | Building/fragment left click only |
| Nuke range | Weapon 6 slider, presets, or Shift+wheel |
| Inspect nuclear target radius | Select tool 6 and move mouse over terrain |
| Clear craters, damaged buildings and fragments | R |

## v0.2.1 — changes after the first real Windows screenshot

- **Compact in-game HUD:** the old screen-height diagnostic sidebar is replaced by a small collapsible world/map card in the upper-left corner and a six-weapon dock at the bottom. Score and style remain in the upper right. The world-map picker remains fully accessible.
- **Honest map status:** duplicate region clicks no longer falsely display a download failure. While data is loading, a visible Cancel button is available; after a real Overpass failure, Retry and per-server HTTP/timeout details are shown. Selecting a different region cancels the previous request.
- **Offline behavior:** already downloaded regions continue to load from cache, and failures do not erase the active 3D scene. The first scene is explicitly identified as *fictional training data* until the real campus has successfully loaded. Real campus data is **not bundled**, so Windows still needs access to public OpenStreetMap/Overpass servers to show it.
- **Less artificial appearance:** the default camera starts closer to the training buildings; masonry/window materials, cornices, roof colors, trees and terrain size were adjusted to reduce a blue-checkered-box-on-empty-grass impression.
- **More accurate collisions after destruction:** on first fracture, the coarse full-building collision is disabled and replaced by individual still-intact cell colliders; destroyed cells no longer leave invisible solid walls.
- **Reliable craters on small maps:** the crater radius adapts to the grid resolution instead of disappearing between sparse vertices.
- **Tests:** added offline cache / cancellation / retry coverage, scene-tree HUD smoke checks and fracture-collider regression.

**Important:** This is still a stylized sandbox under active development, not a faithful graphical or mechanical reproduction of SMASH. Only Godot headless tests run in PR CI. Windows visual quality and actual map connectivity must be tested on the officially released EXE by the user.

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

Select **지도 [M]** to search a place, pan/zoom the world map, then click or draw a rectangle and press **BUILD SELECTED 3D REGION**. Limited to 50–1600 metres on each side to protect memory and public APIs. Initial Dong-A Seunghak campus preset, direct coordinates and synthetic offline training scene also remain available.

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
