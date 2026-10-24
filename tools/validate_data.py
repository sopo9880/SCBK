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
assert "gameplay_v2.gd" in (ROOT / "scenes/main.tscn").read_text("utf-8")
assert "partial" in (ROOT / "scripts/destructible_building.gd").read_text("utf-8").lower()
assert "func damage_at(" in (ROOT / "scripts/destructible_building.gd").read_text("utf-8")
print("SCBK v0.2.0 data, map selection, native destruction and source layout validated.")
