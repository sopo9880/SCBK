# SCBK — Campus Smash (Windows)

Native Windows 3D destruction sandbox powered by **Godot 4.5.1 / GDScript**, not a browser wrapper.

## Current scope: v0.1.0 development

- Windows desktop project; **no Android project, APK, or Android CI**.
- Offline **synthetic** training block available instantly (not actual Dong-A University geometry).
- Load **real building footprints and roads from OpenStreetMap** for Dong-A University Seunghak campus or any selected point/rectangle. Native in-game world map supports place search, pan/zoom and click/drag bounding boxes (50–1600 m per side).
- Cache downloaded map data under Godot's `user://regions` folder for later offline use.
- Six stylized tools: bomb, bat, laser, meteor, quake, and nuke.
- Click-to-destroy physics debris, collision, reset, one-step undo, camera orbit/zoom/pan, FPS counter and debris budget.
- Low-overhead initial rendering: static geometry until a building is struck; limited physics objects.
- **Not yet included:** DEM terrain elevation, photorealistic buildings, detailed fracture geometry, mobile controls and Android binaries. Native map clicking and rectangle selection ARE implemented in this branch.

## Play / controls

Open `project.godot` in [Godot 4.5.1](https://godotengine.org/download/) and press F6/F5, or run with `godot --path .`.

- Left click: use selected tool.
- Right drag: rotate camera; middle drag: pan; wheel: zoom.
- Keys **1–6**: switch tool; **R**: reset; **Ctrl+Z**: undo.
- Left panel: click **OPEN WORLD MAP** to search a place, pan/zoom, click for a preset square or drag to select a rectangular region, then BUILD SELECTED 3D REGION. The original coordinate entry remains available.
- Map download requires internet initially and uses public Overpass servers. Cached regions work offline. The native selection map uses OSM raster tiles (cached locally; may need internet), and explicit Nominatim search (no autocomplete). Please respect their usage limits.

## How the real map works

The app asks OSM's public Overpass API for `building` and `highway` ways, translates their geographic positions into a local metre coordinate system, estimates untagged building heights, then extrudes buildings and lays out roads. OSM coverage is incomplete; a campus name does **not** mean official surveyed 3D geometry. A network failure leaves the offline **fictional** training block playable.

OSM features and derived map data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Use the public Overpass endpoints responsibly; this v0.1 client limits region radius and caches results. Do not bulk scrape.

## Development process

Pull requests run Godot headless parser/smoke tests and Python static tests. When code is merged, a separate CI job exports a Windows executable and stores its checksum and commit SHA. A release workflow can publish that **same** checked Windows build as v0.1.0 without recompilation. No automatic binaries are claimed until Actions pass.

See `docs/ARCHITECTURE.md` for current limitations and the path toward selectable-map areas and terrain DEM data.

The implementation is independent; no source code was copied from the SMASH project. Their repository is useful as a reference for the *concept*, but being publicly visible is not automatically a reuse license.
