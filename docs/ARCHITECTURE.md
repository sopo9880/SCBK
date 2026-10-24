# SCBK Windows architecture — v0.1.0

## Initial development decision

Godot 4.5.1 and GDScript target Windows desktop. Android is intentionally excluded until separately requested. This is not a Windows WebView wrapper.

## Region pipeline

- Startup: bundled *fictional* training block loads without a network.
- App then attempts Dong-A University Seunghak campus OSM query with cache-first lookup.
- Public Overpass returns building footprints and roads (no proprietary map tiles).
- MapService converts WGS84 points to local metres near selected coordinate and saves a derived JSON map to the user's local directory.
- WorldBuilder generates static mesh/box collision buildings and batches roads to one mesh.
- In this first cut heights are estimated when missing, ground is planar; campus boundary and vegetation are not surveyed yet.

## Destruction and performance

- Whole buildings stay static until hit.
- On first impact a building becomes up to eight simplified physics pieces.
- Total active rigid-body budget <=128; later impacts may remove buildings without producing additional fragments.
- Explosion effects are transient; the bat only targets a single structure; the remaining tools use different radius/impulse settings.
- Undo tracks the most recently affected action (not a complete action-history); reset restores all.
- A building's collision uses a bounding box, not precise polygon collision; detailed physics and fracturing require future work.
- Roads are visual only; network failures must not prevent playing.

## Known limitations

- No DEM elevation or hillside terrain yet; actual Seunghak campus is not topographically accurate.
- No texture photography, interior models, sound design, scores or networking.
- No mouse-driven interactive 2D map selection; latitude/longitude input works instead.
- Only point-and-click tool variants; no dedicated laser-drag or quake-over-time animation.
- Large region data is capped to 280 buildings and 200 roads. Long lists are truncated in response order.
- No Android export, interface, APK or Android CI.
- Headless CI checks parser/import and scene boot. GUI rendering and real-machine FPS require later user testing of a Windows binary.
- Original Hong-Iron/SMASH source code was not copied; project uses its own Godot implementation.

## CI pipeline

- PR: Godot headless import/parse, schema verification, basic headless boot.
- After PR validation and authorized merge: Windows Build exports EXE once and uploads checksum + commit provenance.
- Real Windows runtime user testing and formal release are later independent steps.
