#!/usr/bin/env python3
"""Dependency-free schema/static checks. Run by CI and locally."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "data/offline_demo.json").read_text("utf-8"))
assert data["buildings"], "empty demo"
ids = [b["id"] for b in data["buildings"]]
assert len(set(ids)) == len(ids), "duplicate building ids"
for b in data["buildings"]:
    assert b["height"] >= 3, b
    assert len(b["outline"]) >= 3, b
    assert all(len(p) == 2 and all(isinstance(v, (float, int)) for v in p) for p in b["outline"])
assert len(data["buildings"]) <= 280
for r in data["roads"]:
    assert len(r["path"]) > 1
    assert r["width"] > 0
source = (ROOT / "scripts/main.gd").read_text("utf-8")
for keyword in ("_load_donga", "_load_custom_region", "_pick_and_fire", "_undo", "_reset"):
    assert keyword in source, keyword
for path in ["project.godot", "scenes/main.tscn", "scripts/destructible_building.gd", "scripts/region_loader.gd", "scripts/world_builder.gd"]:
    assert (ROOT / path).is_file(), path
map_picker = (ROOT / "scripts/map_picker.gd").read_text("utf-8")
for feature in ("_search", "_choose_result", "_commit_area", "_confirm", "_refresh_tiles"):
    assert feature in map_picker, feature
region_loader = (ROOT / "scripts/region_loader.gd").read_text("utf-8")
assert "func load_bounds(" in region_loader
assert "total_buildings" in region_loader
assert "load_bounds(bounds, label)" in source
assert (ROOT / "tests/test_map_math.gd").is_file()
for path in [
    "scripts/gameplay_v2.gd", "scripts/terrain_surface.gd", "scripts/elevation_loader.gd",
    "scripts/combat_effects.gd", "scripts/score_system.gd",
    "scripts/synth_sfx.gd", "shaders/building_facade.gdshader",
    "tests/test_gameplay.gd",
]:
    assert (ROOT / path).is_file(), path
assert "gameplay_v023.gd" in (ROOT / "scenes/main.tscn").read_text("utf-8")
for new_script in ("scripts/gameplay_v022.gd", "scripts/gameplay_v023.gd", "scripts/ground_map_projection.gd"):
    assert (ROOT / new_script).is_file(), new_script
weapons = (ROOT / "scripts/combat_effects.gd").read_text("utf-8")
assert "func set_nuke_radius(" in weapons
assert "terrain_struck.emit" in weapons
ground = (ROOT / "scripts/terrain_surface.gd").read_text("utf-8")
assert "func set_map_texture(" in ground
assert "func crater_at(" in ground
map_projection = (ROOT / "scripts/ground_map_projection.gd").read_text("utf-8")
assert "func _try_cached_map(" in map_projection
assert "_request.request(" not in map_projection and "HTTPRequest.new()" not in map_projection
for regression in ("tests/test_projection_v022.gd", "tests/test_weapon_v022.gd", "tests/test_cinematic_v023.gd", "tests/test_progress_laser_v023.gd"):
    assert (ROOT / regression).is_file(), regression
assert (ROOT / "scripts/game_ui_v021.gd").is_file()
for feature in ("func cancel_load(", "func retry_last(", "loading_progress"):
    assert feature in region_loader, feature
for test in ("tests/test_map_loading.gd", "tests/test_ui_shell.gd"):
    assert (ROOT / test).is_file(), test
assert "func damage_at(" in (ROOT / "scripts/destructible_building.gd").read_text("utf-8")
assert 'config/name="SCBK - World Smash v0.2.3"' in (ROOT / "project.godot").read_text("utf-8")
assert 'application/product_version="0.2.3"' in (ROOT / "export_presets.cfg").read_text("utf-8")
assert "signal load_stage(" in region_loader and "load_stage.emit(" in region_loader
world = (ROOT / "scripts/world_builder.gd").read_text("utf-8")
assert "func massive_blast(" in world and "func quake_pulse(" in world
assert "func collapse_lightweight(" in (ROOT / "scripts/destructible_building.gd").read_text("utf-8")
assert "func laser_cut(" in ground
hud = (ROOT / "scripts/gameplay_v023.gd").read_text("utf-8")
for feature in ("_install_loading_meter", "_set_quake_magnitude", "_set_bat_size", "_v2_fire_laser", "GIANT_NUKE"):
    assert feature in hud, feature
assert "signal laser_ground_cut(" in weapons
assert "signal seismic_wave(" in weapons
assert "signal massive_impact(" in weapons
print("SCBK v0.2.3 measured map loader, 8km blast, quake, bat and cinematic laser source validated.")
